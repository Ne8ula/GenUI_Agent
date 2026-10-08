import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app imports week4/core, week4/fixtures and week4/schemas directly; allow Vite to serve them.
const week4Root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1440, strictPort: true, fs: { allow: [week4Root] } },
  preview: { host: '127.0.0.1', port: 1441, strictPort: true },
  build: { target: 'es2023', sourcemap: false },
});
