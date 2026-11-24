/**
 * Part 10 (dev-only): validates the curated formula map against the real code graph, then writes
 *   - the Mermaid views into docs/FORMULA_DEPENDENCY_MAP.md (between <!-- map:<id> --> … <!-- /map:<id> --> markers),
 *   - the node traceability table (between <!-- map:trace --> markers),
 *   - one rendered SVG per view into docs/diagrams/<id>.svg (own layered layout; no new dependency),
 *   - docs/diagrams/code-graph.json (the raw graph).
 *
 *   node scripts/formula-map.mjs            (fails with a list of problems if any edge is not backed by code)
 *
 * Nothing here is imported by the app: the bundle and the CSP are unchanged.
 */
import fs from 'node:fs';
import { buildGraph } from './formula-graph.mjs';
import { NODES, VIEWS } from './formula-map.views.mjs';

const DOC = 'docs/FORMULA_DEPENDENCY_MAP.md';
const LAYERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const LAYER_NAME = { A: 'A · input data', B: 'B · set level', C: 'C · exercise / muscle', D: 'D · week', E: 'E · planning & decisions', F: 'F · screens' };

/** Rule id → basis, read from rules.ts (the registry is TypeScript; a text read keeps this script dependency-free). */
export function ruleBases() {
  const src = fs.readFileSync('src/data/scientific-evidence/rules.ts', 'utf8');
  const out = {};
  for (const chunk of src.split(/\n {4}id: '/).slice(1)) {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const m = chunk.match(/basis: '([a-z_]+)'/);
    if (m) out[id] = m[1];
  }
  return out;
}
const BASIS_RANK = { research: 0, research_informed_heuristic: 1, heuristic: 2 };
/** A node's basis = the weakest basis among its rules (a formula is only as established as its least established part). */
export function nodeBasis(node, bases) {
  const bs = (node.rules ?? []).map((r) => bases[r]).filter(Boolean);
  if (!bs.length) return node.kind === 'input' || node.kind === 'ui' || node.noBasis ? null : 'app_choice';
  return bs.sort((a, b) => BASIS_RANK[b] - BASIS_RANK[a])[0];
}

const hasEdge = (g, from, to) => g.edgeSet.has(`${from}|${to}`);
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** Declarations reachable from `ref` within `n` references (ref → consumer → consumer …). */
function reach(g, ref, n) {
  let frontier = new Set([ref]);
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const next = new Set();
    for (const e of g.edges) if (frontier.has(e.from) && !seen.has(e.to)) { next.add(e.to); seen.add(e.to); }
    frontier = next;
  }
  return seen;
}
const commonCaller = (g, a, b) => { const ra = reach(g, a, 3); return [...reach(g, b, 3)].some((x) => x !== a && x !== b && ra.has(x)); };

/** Test files that reference the node's function by name (word match), for the traceability table. */
export function testsOf(name) {
  if (!testsOf.cache) testsOf.cache = fs.readdirSync('tests').filter((f) => f.endsWith('.ts')).map((f) => [f, fs.readFileSync(`tests/${f}`, 'utf8')]);
  return testsOf.cache.filter(([f, t]) => f !== 'formula-map.test.ts' && new RegExp(`\\b${name}\\b`).test(t)).map(([f]) => f);
}
const exists = (g, ref) => !!g.nodes[ref] || !!g.texts[ref];

/** Every problem with the map (empty = every node exists and every edge is backed by code). */
export function validate(graph = buildGraph({ texts: true })) {
  const g = { ...graph, edgeSet: new Set(graph.edges.map((e) => `${e.from}|${e.to}`)) };
  const bases = ruleBases();
  const problems = [];
  for (const [id, n] of Object.entries(NODES)) {
    if (!exists(g, n.ref)) problems.push(`node ${id}: ${n.ref} not found in the code`);
    for (const r of n.rules ?? []) if (!bases[r]) problems.push(`node ${id}: rule ${r} not in rules.ts`);
  }
  for (const v of VIEWS) {
    for (const e of v.edges) {
      const a = NODES[e.from];
      const b = NODES[e.to];
      if (!a || !b) { problems.push(`${v.id}: unknown node in ${e.from} → ${e.to}`); continue; }
      if (e.kind === 'data') {
        const pt = stripComments(g.texts[a.ref] ?? '');
        const ct = stripComments(g.texts[b.ref] ?? '');
        const f = e.field;
        if (!f || !new RegExp(`\\b${f}\\b`).test(pt) || !new RegExp(`\\.${f}\\b|\\{[^}]*\\b${f}\\b[^}]*\\}\\s*=`).test(ct)) problems.push(`${v.id}: data edge ${e.from} → ${e.to} (field ${f}) not found in the source`);
        // Not a stored type: provider and consumer must meet in a common caller (≤ 3 references away from each).
        else if (a.kind !== 'input' && !commonCaller(g, a.ref, b.ref)) problems.push(`${v.id}: data edge ${e.from} → ${e.to} has no common caller`);
        continue;
      }
      const chain = [a.ref, ...(e.via ?? []).map((x) => NODES[x]?.ref ?? x), b.ref];
      // A screen passing a value down to a child component it renders: the code reference goes child → parent (the parent
      // renders it), the data goes parent → child. Accepted only between two UI declarations.
      const ok = (x, y) => hasEdge(g, x, y) || (x.startsWith('src/ui/') && y.startsWith('src/ui/') && hasEdge(g, y, x));
      for (let i = 1; i < chain.length; i++) if (!ok(chain[i - 1], chain[i])) problems.push(`${v.id}: edge ${e.from} → ${e.to} not backed (${chain[i - 1]} → ${chain[i]})`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- Mermaid

const KIND_STYLE = {
  input: 'fill:#eef2ff,stroke:#6366f1,color:#1e1b4b',
  formula: 'fill:#ecfeff,stroke:#0891b2,color:#083344',
  rule: 'fill:#fff7ed,stroke:#ea580c,color:#431407',
  aggregation: 'fill:#f0fdf4,stroke:#16a34a,color:#052e16',
  decision: 'fill:#fdf2f8,stroke:#db2777,color:#500724',
  ui: 'fill:#f8fafc,stroke:#64748b,color:#0f172a',
};
const mLabel = (s) => s.replace(/"/g, "'").replace(/\n/g, '<br/>');

export function mermaid(view) {
  const ids = [...new Set(view.edges.flatMap((e) => [e.from, e.to]))];
  const lines = ['flowchart LR'];
  for (const L of LAYERS) {
    const inL = ids.filter((id) => NODES[id].layer === L);
    if (!inL.length) continue;
    lines.push(`  subgraph ${L}["${LAYER_NAME[L]}"]`);
    for (const id of inL) lines.push(`    ${id}["${mLabel(NODES[id].label)}"]:::${NODES[id].kind}`);
    lines.push('  end');
  }
  for (const e of view.edges) {
    const label = e.kind === 'data' ? e.field : e.kind === 'cond' ? 'if' : '';
    const arrow = e.kind === 'agg' ? '==>' : e.kind === 'cond' ? '-.->' : '-->';
    lines.push(`  ${e.from} ${arrow}${label ? `|${label}|` : ''} ${e.to}`);
  }
  for (const [k, s] of Object.entries(KIND_STYLE)) lines.push(`  classDef ${k} ${s}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- SVG (own layered layout)

const BASIS_STROKE = { research: '#16a34a', research_informed_heuristic: '#2563eb', heuristic: '#ea580c', app_choice: '#9333ea' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function svg(view, bases) {
  const ids = [...new Set(view.edges.flatMap((e) => [e.from, e.to]))];
  const cols = LAYERS.filter((L) => ids.some((id) => NODES[id].layer === L));
  const W = 230, GAPX = 90, PADY = 14, LINE = 15, TOP = 56;
  const h = (id) => NODES[id].label.split('\n').length * LINE + 2 * PADY - 6;
  // Order inside a column: barycentre of the predecessors' positions (two passes), then the declaration order.
  const order = {};
  cols.forEach((L) => { order[L] = ids.filter((id) => NODES[id].layer === L); });
  const pos = {};
  for (let pass = 0; pass < 3; pass++) {
    for (const L of cols) {
      order[L].forEach((id, i) => { pos[id] = i; });
      const score = (id) => {
        const ps = view.edges.filter((e) => e.to === id && NODES[e.from].layer !== L).map((e) => pos[e.from] ?? 0);
        const ss = view.edges.filter((e) => e.from === id && NODES[e.to].layer !== L).map((e) => pos[e.to] ?? 0);
        const all = pass % 2 ? [...ss, ...ps] : [...ps, ...ss];
        return all.length ? all.reduce((s, x) => s + x, 0) / all.length : pos[id];
      };
      order[L] = [...order[L]].sort((a, b) => score(a) - score(b) || ids.indexOf(a) - ids.indexOf(b));
    }
  }
  const box = {};
  let height = 0;
  cols.forEach((L, ci) => {
    let y = TOP + 10;
    for (const id of order[L]) {
      box[id] = { x: 20 + ci * (W + GAPX), y, w: W, h: h(id) };
      y += h(id) + 22;
    }
    height = Math.max(height, y);
  });
  const width = 20 + cols.length * (W + GAPX) - GAPX + 70; // room for same-column curves on the right
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 70}" width="${width}" height="${height + 70}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12">`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  out.push(`<defs>${['call', 'cond', 'data', 'agg', 'ui'].map((k) => `<marker id="m-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${EDGE[k].color}"/></marker>`).join('')}</defs>`);
  out.push(`<text x="20" y="24" font-size="16" font-weight="700" fill="#0f172a">${esc(view.title)}</text>`);
  cols.forEach((L, ci) => out.push(`<text x="${20 + ci * (W + GAPX)}" y="${TOP - 8}" font-size="11" font-weight="700" fill="#64748b" letter-spacing="0.5">${esc(LAYER_NAME[L].toUpperCase())}</text>`));
  for (const e of view.edges) {
    const a = box[e.from], b = box[e.to];
    const st = EDGE[e.kind];
    let d;
    if (NODES[e.from].layer === NODES[e.to].layer) {
      const x = a.x + W, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
      d = `M${x},${y1} C${x + 45},${y1} ${x + 45},${y2} ${x},${y2}`;
    } else {
      const fwd = a.x < b.x;
      const x1 = fwd ? a.x + W : a.x, x2 = fwd ? b.x : b.x + W, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
    out.push(`<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} marker-end="url(#m-${e.kind})" opacity="0.85"><title>${esc(`${e.from} → ${e.to} (${e.kind})${e.note ? ': ' + e.note : ''}${e.field ? ' · field ' + e.field : ''}`)}</title></path>`);
  }
  for (const id of ids) {
    const n = NODES[id], b = box[id];
    const [fill, stroke, color] = KIND_STYLE[n.kind].split(',').map((x) => x.split(':')[1]);
    const basis = nodeBasis(n, bases);
    out.push(`<g><title>${esc(`${n.ref}${n.rules?.length ? ' · rules: ' + n.rules.join(', ') : ''}${basis ? ' · basis: ' + basis : ''}`)}</title>`);
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="9" fill="${fill}" stroke="${basis ? BASIS_STROKE[basis] : stroke}" stroke-width="${basis ? 2.5 : 1.5}"/>`);
    n.label.split('\n').forEach((t, i) => out.push(`<text x="${b.x + 10}" y="${b.y + PADY + 6 + i * LINE}" fill="${color}"${i === 0 ? ' font-weight="700"' : ''}>${esc(t)}</text>`));
    out.push('</g>');
  }
  // Legend
  const ly = height + 22;
  const items = [['input', 'input'], ['formula', 'formula'], ['rule', 'rule / threshold'], ['aggregation', 'aggregation'], ['decision', 'decision'], ['ui', 'screen']];
  items.forEach(([k, t], i) => { const [fill, stroke] = KIND_STYLE[k].split(',').map((x) => x.split(':')[1]); out.push(`<rect x="${20 + i * 120}" y="${ly}" width="14" height="14" rx="3" fill="${fill}" stroke="${stroke}"/><text x="${40 + i * 120}" y="${ly + 11}" fill="#334155">${t}</text>`); });
  Object.entries({ research: 'border: research', research_informed_heuristic: 'research-informed heuristic', heuristic: 'heuristic', app_choice: 'app choice (no rule)' }).forEach(([k, t], i) => out.push(`<rect x="${20 + i * 190}" y="${ly + 24}" width="14" height="14" rx="3" fill="#fff" stroke="${BASIS_STROKE[k]}" stroke-width="2.5"/><text x="${40 + i * 190}" y="${ly + 35}" fill="#334155">${t}</text>`));
  out.push('</svg>');
  return out.join('\n');
}
const EDGE = {
  call: { color: '#334155', width: 1.4 },
  cond: { color: '#64748b', width: 1.4, dash: '5 4' },
  data: { color: '#0891b2', width: 1.6, dash: '2 3' },
  agg: { color: '#16a34a', width: 2.6 },
  ui: { color: '#94a3b8', width: 1.2 },
};

// ---------------------------------------------------------------- traceability

export function traceTable(graph, bases) {
  const consumers = (ref) => graph.edges.filter((e) => e.from === ref && !e.to.startsWith(ref.split('#')[0] + '#')).map((e) => e.to);
  const providers = (ref) => graph.edges.filter((e) => e.to === ref && !e.from.startsWith(ref.split('#')[0] + '#') && /^src\/(domain|data)\//.test(e.from) && !/#(L|getLang|num|byLang|ruPlural|muscleName|MUSCLE_BY_ID|TRACKED_MUSCLES|addDays|diffDays|round1|round2|roundHalf)$/.test(e.from)).map((e) => e.from);
  const short = (r) => '`' + r.replace(/^src\//, '').replace('#', '` · `') + '`';
  const rows = ['| Node | Layer · kind | File · function | Reads (from) | Used by | Rules (basis) | Tests that call it directly |', '|---|---|---|---|---|---|---|'];
  for (const [id, n] of Object.entries(NODES)) {
    if (n.kind === 'input') continue;
    const b = nodeBasis(n, bases);
    rows.push(`| **${id}** ${n.label.split('\n')[0]} | ${n.layer} · ${n.kind} | ${short(n.ref)} | ${providers(n.ref).slice(0, 8).map((r) => r.replace(/^src\/(domain|data\/scientific-evidence)\//, '')).join(', ') || '—'} | ${consumers(n.ref).slice(0, 8).map((r) => r.replace(/^src\//, '')).join(', ') || '—'} | ${(n.rules ?? []).map((r) => `${r} (${bases[r]})`).join(', ') || (b === 'app_choice' ? 'no rule — app choice' : '—')} | ${(() => { const t = n.kind === 'ui' ? [] : testsOf(n.ref.split('#')[1]); return t.length ? t.slice(0, 4).join(', ') + (t.length > 4 ? ` +${t.length - 4}` : '') : (n.kind === 'ui' ? 'e2e' : '**none — covered only through callers**'); })()} |`);
  }
  return rows.join('\n');
}

function inject(doc, key, body) {
  const a = `<!-- map:${key} -->`, b = `<!-- /map:${key} -->`;
  const i = doc.indexOf(a), j = doc.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers for ${key} missing in ${DOC}`);
  return doc.slice(0, i + a.length) + '\n' + body + '\n' + doc.slice(j);
}

export function renderDoc(doc, graph, bases) {
  doc = inject(doc, 'stats', `Code graph: **${Object.keys(graph.nodes).length} declarations, ${graph.edges.length} value references**; curated map: **${Object.keys(NODES).length} nodes, ${VIEWS.reduce((s, v) => s + v.edges.length, 0)} edges in ${VIEWS.length} views**.`);
  const untested = Object.entries(NODES).filter(([, n]) => n.kind !== 'ui' && n.kind !== 'input' && !testsOf(n.ref.split('#')[1]).length).map(([id, n]) => `\`${n.ref.replace(/^src\//, '')}\` (${id})`);
  doc = inject(doc, 'untested', untested.length ? untested.map((x) => `- ${x}`).join('\n') : '- none');
  for (const v of VIEWS) doc = inject(doc, v.id, '```mermaid\n' + mermaid(v) + '\n```\n\n![' + v.title + '](diagrams/' + v.id + '.svg)');
  return inject(doc, 'trace', traceTable(graph, bases));
}

if (process.argv[1]?.endsWith('formula-map.mjs')) {
  const graph = buildGraph({ texts: true });
  const problems = validate(graph);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const bases = ruleBases();
  const { texts, ...plain } = graph; void texts;
  fs.mkdirSync('docs/diagrams', { recursive: true });
  fs.writeFileSync('docs/diagrams/code-graph.json', JSON.stringify(plain, null, 1) + '\n');
  for (const v of VIEWS) fs.writeFileSync(`docs/diagrams/${v.id}.svg`, svg(v, bases) + '\n');
  if (fs.existsSync(DOC)) fs.writeFileSync(DOC, renderDoc(fs.readFileSync(DOC, 'utf8'), plain, bases));
  console.log(`ok: ${Object.keys(NODES).length} nodes, ${VIEWS.reduce((s, v) => s + v.edges.length, 0)} edges in ${VIEWS.length} views, all backed by code`);
}
