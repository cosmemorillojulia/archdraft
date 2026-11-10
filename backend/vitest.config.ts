import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'evals/**/*.ts'],
      // The command line only reads arguments and writes files, and the Durable Object
      // only hands its storage to `consumeDailyUse`; what both run is tested.
      exclude: ['evals/cli.ts', 'src/usage-counter.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
