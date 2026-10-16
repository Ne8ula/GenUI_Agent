import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app imports week4/core, week4/fixtures and week4/schemas directly; allow Vite to serve them.
const week4Root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react(), {
    name: 'scan-fixture-assets',
    apply: 'build',
    generateBundle() {
      // Explicit data-only allowlist; do not copy historical reference imagery.
      for (const name of ['scene.json', 'points.bin']) {
        this.emitFile({ type: 'asset', fileName: `assets/paris-scan-r12/${name}`,
          source: readFileSync(new URL(`./public/assets/paris-scan-r12/${name}`, import.meta.url)) });
      }
      // R15 owner-approved archival discovery assets, separate from scene rendering.
      for (const name of ['montparnasse-1980.jpg', 'montmartre-1980.jpg', 'conciergerie-1980.jpg', 'credits.html', 'credits.json']) {
        this.emitFile({ type: 'asset', fileName: `sources/paris-r15/${name}`,
          source: readFileSync(new URL(`./public/sources/paris-r15/${name}`, import.meta.url)) });
      }
      for (const name of ['paris-r10/tgv53-1985.jpg', 'paris-r10/rue-christine-1988.jpg', 'paris-r17/beaubourg-1980s.jpg', 'paris-r17/clichy-1982.jpg', 'paris-r17/credits.html', 'paris-r17/credits.json']) {
        this.emitFile({ type: 'asset', fileName: `sources/${name}`,
          source: readFileSync(new URL(`./public/sources/${name}`, import.meta.url)) });
      }
    },
  }],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1440, strictPort: true, fs: { allow: [week4Root] } },
  preview: { host: '127.0.0.1', port: 1441, strictPort: true },
  // Broad historical-public copying stays disabled. Only the explicit scan-data and
  // archival-photo allowlists above enter production; no reference/video scene plates.
  build: { target: 'es2023', sourcemap: false, copyPublicDir: false },
});
