import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
const CI = process.env.CI !== undefined;

/**
 * End-to-end tests of the editor (docs/modulos/web.md, Tests de extremo a extremo).
 *
 * They run against a production build served by `vite preview`, built with an API on the same
 * origin. Nothing answers there: every test that uses the assistant answers it with
 * `page.route`, so the tests need no backend and no network.
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` points at a Chromium already on the machine instead of the one
 * `playwright install` downloads, for environments that cannot download it.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]] : 'list',
  use: {
    baseURL: `${ORIGIN}/archdraft/`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
      },
    },
  ],
  webServer: {
    command: `vite build --outDir e2e/.dist && vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: `${ORIGIN}/archdraft/`,
    env: { VITE_API_URL: `${ORIGIN}/api` },
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
