import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';

// Strict Content-Security-Policy for the production build only (the dev server needs an
// inline React-refresh script). No third-party origins: the app makes no network requests.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Emits sw.js that precaches every built file, so the app opens offline in the gym. */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'gymrat-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const statics = ['favicon.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`), ...statics.map((f) => `./${f}`)];
      const version = `gymrat-${Date.now().toString(36)}`;
      const source = readFileSync('scripts/sw-template.js', 'utf8')
        .replace('__CACHE__', version)
        .replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

function cspPlugin(): Plugin {
  return {
    name: 'gymrat-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// `base: './'` makes the build work from any GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin(), serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['dexie', 'zod'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
