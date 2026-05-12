import { defineConfig, devices } from '@playwright/test';

// E2E smoke suite — runs against a deployed environment (or a local `expo start --web`).
//
//   PLAYWRIGHT_BASE_URL   URL of the running web app   (default: http://localhost:8081)
//   PLAYWRIGHT_API_URL    URL of the backend API      (default: http://localhost:8000)
//
// In CI, set both to the deployed URLs as repository secrets/variables.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Tests create accounts/reports via the API; keep them serial so a flaky
  // network call can't cascade and so output stays readable.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
