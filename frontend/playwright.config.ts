import { defineConfig, devices, type Project } from '@playwright/test';

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
const chromium = executablePath === undefined ? {} : { executablePath };

const README_SCREENSHOTS = process.env.README_SCREENSHOTS !== undefined;

/** A project that takes screenshots: no motion, and text drawn the same on every machine. */
function visualProject(name: string, testMatch: string): Project {
  return {
    name,
    testMatch,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      contextOptions: { reducedMotion: 'reduce' },
      launchOptions: {
        ...chromium,
        args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'],
      },
    },
  };
}

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
  expect: {
    // Text and anti-aliasing differ a little between machines; a moved or missing panel does not.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  projects: [
    {
      name: 'chromium',
      testIgnore: ['visual.spec.ts', 'readme.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: chromium,
      },
    },
    // Visual regression (visual.spec.ts).
    visualProject('visual', 'visual.spec.ts'),
    // Screenshots of the README (readme.spec.ts), only on demand: `pnpm screenshots`.
    ...(README_SCREENSHOTS ? [visualProject('readme', 'readme.spec.ts')] : []),
  ],
  webServer: {
    command: `vite build --outDir e2e/.dist && vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: `${ORIGIN}/archdraft/`,
    env: { VITE_API_URL: `${ORIGIN}/api` },
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
