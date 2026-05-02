import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['icon.svg', 'apple-touch-icon.svg'],
      registerType: 'autoUpdate',
      manifest: {
        name: 'Loremail',
        short_name: 'Loremail',
        description: 'An epistolary world-building game',
        theme_color: '#1a1410',
        background_color: '#f5f0e8',
        display: 'standalone',
        icons: [
          { src: '/LoreMail/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
        screenshots: [],
        shortcuts: [],
      },
    }),
  ],
  base: '/LoreMail/',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
