import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    hmr: true,
    proxy: {
      '/api/openclaw': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/workflow': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
