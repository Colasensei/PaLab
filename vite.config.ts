import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// /api 代理：dev（server）与生产预览（preview）共用，转发到 lingyanspace 绕过 CORS。
// 内网穿透 / 本地部署时用 npm run dev 或 npm run preview 启动即可自带代理。
const proxyConf = {
  '/api/upgrade': {
    target: 'https://yarp.lingyanspace.com',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api\/upgrade/, '/api/UpgradeServer/Upgrade'),
  },
  '/api/unauth': {
    target: 'https://yarp.lingyanspace.com',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api\/unauth/, '/UpgradeServer/UnauthorFolder/UpgradeProxy'),
  },
};

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: proxyConf,
  },
  preview: {
    proxy: proxyConf,
  },
  build: {
    target: 'es2020',
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          audio: ['web-audio-beat-detector'],
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
