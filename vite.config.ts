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
        target: 'http://192.168.3.215:18789',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openclaw/, ''),
      },
    },
  },
});
