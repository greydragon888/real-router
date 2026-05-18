import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4226",
    port: 4226,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4226",
  },
});
