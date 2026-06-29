import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig, loadEnv} from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: process.env.VERCEL ? '/' : './',
    plugins: [react(), tailwindcss(), cesium()],
    define: {
      'process.env.ZHIPU_AI_KEY': JSON.stringify(process.env.ZHIPU_AI_KEY || env.ZHIPU_AI_KEY || ''),
      'process.env.QWEN_API_KEY': JSON.stringify(process.env.QWEN_API_KEY || env.QWEN_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
