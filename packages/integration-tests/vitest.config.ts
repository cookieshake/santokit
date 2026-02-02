import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: 'test/integration/flows/global-setup.ts',
    hookTimeout: 600000,
    testTimeout: 60000,
    threads: false,
    isolate: false,
    maxConcurrency: 1,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
