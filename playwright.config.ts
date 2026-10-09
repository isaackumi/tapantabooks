import { defineConfig, devices } from "@playwright/test";

const PORT = 3005;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // `next dev` reloads open pages while it compiles a route for the first time, which aborts parallel navigations.
  workers: ci ? 2 : 1,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // CI tests the production build; locally a running `npm run dev` is reused.
    command: ci ? "npm run start" : "npm run dev",
    url: `http://localhost:${PORT}/auth/login`,
    reuseExistingServer: !ci,
    timeout: 180_000,
    env: { NEXT_PUBLIC_USE_MOCK_API: "true" },
  },
});
