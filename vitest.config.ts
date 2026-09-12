import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 15000,
    coverage: { provider: 'v8', include: ['packages/sdk/src/**'], thresholds: { lines: 85 } },
  },
});
