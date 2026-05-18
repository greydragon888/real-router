import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm build:app && pnpm preview --port 4245",
    port: 4245,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4245",
  },
});
