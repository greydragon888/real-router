import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4231",
    port: 4231,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4231",
  },
});
