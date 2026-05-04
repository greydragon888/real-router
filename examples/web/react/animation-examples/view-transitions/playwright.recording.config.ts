import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-recording",
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  webServer: {
    command: "pnpm preview",
    port: 4173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1024, height: 576 },
    headless: true,
    deviceScaleFactor: 1,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },
});
