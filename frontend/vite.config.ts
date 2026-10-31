import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The `VITE_` defaults of the repository (.env.defaults) for the dev server.
 * Only those reach the browser; secrets live in .env.secrets, which the
 * frontend never reads. A variable already set in the shell wins, and builds
 * and tests do not use the defaults: production must not point at localhost.
 */
function loadDevDefaults(): void {
  const file = new URL('../.env.defaults', import.meta.url);
  if (!existsSync(file)) return;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (name.startsWith('VITE_') && process.env[name] === undefined) process.env[name] = value;
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'serve' && mode === 'development') loadDevDefaults();
  return {
    // GitHub Pages serves the project site under the repository name. Using the
    // same base in development keeps local URLs identical to production.
    base: '/archdraft/',
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        reporter: ['text', 'json-summary'],
        // The layout engine is pure code, held to the same bar as the shared package.
        thresholds: {
          'src/layout/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        },
      },
    },
  };
});
