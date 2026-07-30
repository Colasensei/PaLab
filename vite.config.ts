import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

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
    proxy: {
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
    },
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
