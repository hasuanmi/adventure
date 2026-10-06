import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // e2e 直连开发库（Docker postgres，huahua）
    env: {
      DATABASE_URL: 'postgresql://huahua:huahua_dev@localhost:5432/huahua?schema=public',
      JWT_SECRET: 'dev-secret-change-me-0123456789abcdef0123456789abcdef',
    },
  },
});
