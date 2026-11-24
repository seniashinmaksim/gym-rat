/**
 * Part 10 (dev-only): the REAL dependency graph of the formulas, read from the source with the TypeScript compiler API
 * (already a dev dependency — nothing is added to the app). For every top-level function / const in src/domain,
 * src/data/scientific-evidence/rules.ts, src/ui (pages, components, hooks, train) it records which other top-level
 * declarations it references (value references only; types are ignored), across files through the named imports.
 *
 *   node scripts/formula-graph.mjs            → docs/diagrams/code-graph.json
 *
 * Edge direction: provider → consumer ("feeds"). The curated map (scripts/formula-map.mjs) may only draw edges that
 * exist here; tests/formula-map.test.ts checks that.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const DIRS = ['src/domain', 'src/ui', 'src/data', 'src/lib', 'src/i18n'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) && !/\.d\.ts$/.test(d.name) ? [p] : [];
  });
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const noExt = (p) => p.replace(/\.(tsx?|jsx?)$/, '');

/** Resolve a relative import to a repo file (without extension) or null for packages. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (fs.existsSync(c)) return noExt(rel(c));
  return null;
}

export function buildGraph({ texts: wantTexts = false } = {}) {
  const texts = {};
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const nodes = {}; // "file#name" -> { file, name, kind, exported, line }
  const edges = new Set(); // "provider|consumer"
  const perFile = new Map();
  for (const f of files) {
    const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const file = noExt(rel(f));
    const imports = new Map(); // local name -> "file#exported"
    const decls = new Map(); // local name -> AST node
    for (const st of src.statements) {
      if (ts.isImportDeclaration(st) && !st.importClause?.isTypeOnly) {
        const target = resolveImport(f, st.moduleSpecifier.text);
        const nb = st.importClause?.namedBindings;
        if (target && nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) imports.set(el.name.text, `${target}#${(el.propertyName ?? el.name).text}`);
        if (target && st.importClause?.name) imports.set(st.importClause.name.text, `${target}#default`);
      }
      const exported = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const line = src.getLineAndCharacterOfPosition(st.getStart()).line + 1;
      if (ts.isFunctionDeclaration(st) && st.name) { decls.set(st.name.text, st); nodes[`${file}#${st.name.text}`] = { file, name: st.name.text, kind: 'function', exported, line }; }
      else if (ts.isClassDeclaration(st) && st.name) { decls.set(st.name.text, st); nodes[`${file}#${st.name.text}`] = { file, name: st.name.text, kind: 'class', exported, line }; }
      else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) { decls.set(d.name.text, d); nodes[`${file}#${d.name.text}`] = { file, name: d.name.text, kind: 'const', exported, line }; }
      }
    }
    perFile.set(file, { imports, decls });
  }
  for (const [file, { imports, decls }] of perFile) {
    for (const [name, node] of decls) {
      const consumer = `${file}#${name}`;
      if (wantTexts) texts[consumer] = node.getText();
      const visit = (n) => {
        if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
        if (ts.isIdentifier(n) && n.text !== name) {
          // Skip property names (obj.name, { name: … }) — only free references.
          const p = n.parent;
          const isProp = (p && ts.isPropertyAccessExpression(p) && p.name === n) || (p && ts.isPropertyAssignment(p) && p.name === n) || (p && ts.isJsxAttribute(p));
          if (!isProp) {
            const provider = imports.get(n.text) ?? (decls.has(n.text) ? `${file}#${n.text}` : null);
            if (provider && nodes[provider] !== undefined) edges.add(`${provider}|${consumer}`);
            else if (provider && provider.endsWith('#default') === false && !nodes[provider]) {
              // Re-exported name (e.g. i18n/index re-exports core): keep the edge to the importing module's name.
              edges.add(`${provider}|${consumer}`);
            }
          }
        }
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(node, visit);
    }
  }
  if (wantTexts) {
    // Declarations that are only types (interfaces / aliases) are inputs of the map: keep their text too.
    for (const f of files) {
      const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      for (const st of src.statements) if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && st.name) texts[`${noExt(rel(f))}#${st.name.text}`] = st.getText();
    }
  }
  return {
    ...(wantTexts ? { texts } : {}),
    generatedFrom: DIRS,
    nodes,
    edges: [...edges].sort().map((e) => { const [from, to] = e.split('|'); return { from, to }; }),
  };
}

if (process.argv[1]?.endsWith('formula-graph.mjs')) {
  const g = buildGraph();
  fs.mkdirSync('docs/diagrams', { recursive: true });
  fs.writeFileSync('docs/diagrams/code-graph.json', JSON.stringify(g, null, 1) + '\n');
  console.log(`nodes ${Object.keys(g.nodes).length}, edges ${g.edges.length}`);
}
