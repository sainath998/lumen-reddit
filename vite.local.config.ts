// Offline preview: plays the real game in a normal browser with a mocked
// backend (src/client/mock.ts). Not used for the Devvit build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src/client',
  mode: 'offline',
  plugins: [react()],
  resolve: {
    alias: { '@devvit/web/client': fileURLToPath(new URL('./src/client/devvit-local-shim.ts', import.meta.url)) },
  },
  build: {
    outDir: '../../dist/local',
    emptyOutDir: true,
    rollupOptions: { input: { game: 'src/client/game.html', splash: 'src/client/splash.html' } },
  },
});
