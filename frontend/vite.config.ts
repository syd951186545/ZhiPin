import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const modeEnv = loadEnv(mode, __dirname, '');
  const productionEnv = loadEnv('production', __dirname, '');
  const mergedEnv = { ...productionEnv, ...modeEnv };
  const defineEnv = Object.fromEntries(
    Object.entries(mergedEnv)
      .filter(([key]) => key.startsWith('VITE_'))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    plugins: [react(), tailwindcss()],
    define: defineEnv,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: true,
      proxy: {
        // 统一代理所有 /api/* 请求到 FastAPI 后端
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
