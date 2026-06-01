import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4246",
    port: 4246,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4246",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
