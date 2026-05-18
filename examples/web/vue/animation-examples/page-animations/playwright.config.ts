import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4275",
    port: 4275,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4275",
  },
});
