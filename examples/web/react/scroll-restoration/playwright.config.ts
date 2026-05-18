import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4243",
    port: 4243,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4243",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
