import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview --port 4222",
    port: 4222,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4222",
  },
});
