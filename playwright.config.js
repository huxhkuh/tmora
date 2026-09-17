import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5184",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] } }
      : { channel: "chrome" }),
    headless: true,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/New_York",
    screenshot: "only-on-failure",
  },
  outputDir: "../../work/playwright-results",
  reporter: [["list"]],
  webServer: {
    command: "node server.mjs",
    env: { PORT: "5184" },
    url: "http://127.0.0.1:5184",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
