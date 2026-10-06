import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发代理：/api → 本机 API（默认 3000；可用 VITE_PROXY_TARGET 覆盖，如本机 3000 被占用时）
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  // 开发期：workspace 的 CJS 包（@huahua/shared-types）预打包为 ESM，避免浏览器直接加载 CJS 导致白屏
  optimizeDeps: {
    include: ['@huahua/shared-types'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  // workspace 包（shared-types）编译为 CJS 且不在 node_modules 内，
  // 需纳入 commonjs 转换才能让 rollup 识别其 __exportStar 具名导出
  build: {
    commonjsOptions: {
      include: [/node_modules/, /shared-types/],
    },
  },
});
