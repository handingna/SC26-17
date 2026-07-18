import { defineConfig, devices } from "@playwright/test";

const productionMode = process.env.E2E_MODE === "production"
  || process.env.npm_lifecycle_event === "test:e2e:prod";
const port = productionMode ? 3100 : 3000;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Use the machine's Chrome installation so local/CI smoke tests do not
      // silently download a browser binary. Override with PLAYWRIGHT_CHANNEL.
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" },
    },
  ],
});
