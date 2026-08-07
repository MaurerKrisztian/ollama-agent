import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const targetPort = process.env.PORT || '3012';

export default defineConfig({
  plugins: [react()],
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
