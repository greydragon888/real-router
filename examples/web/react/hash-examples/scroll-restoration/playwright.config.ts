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
    // The log shows only the final scroll position; a failure that reaches
    // its retry brings the trace of the run into the artifact.
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
