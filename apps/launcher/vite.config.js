import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  base: '/LoreMail/launcher/',
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist' },
  resolve: {
    alias: mode === 'production'
      // In production builds (CI + `vite build`) swap the gitignored dev-config
      // for an empty stub so the build never fails on a missing file.
      ? { './dev-config.js': path.resolve(__dirname, 'src/dev-config.stub.js') }
      // In local dev (`vite` / `vite --mode localdev`) use the real file as normal.
      : {},
  },
}));
