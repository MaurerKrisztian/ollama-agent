import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

const targetPort = process.env.PORT || '3012';

const monacoPlugin = typeof monacoEditorPlugin === 'function' ? monacoEditorPlugin : (monacoEditorPlugin as any).default;

export default defineConfig({
  plugins: [
    react(),
    monacoPlugin({
      // Bundle only the workers we actually use — keeps the bundle small
      languageWorkers: ['editorWorkerService', 'typescript', 'json'],
    }),
  ],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: `http://localhost:${targetPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${targetPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
