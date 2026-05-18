import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && PORT=3003 pnpm preview",
    port: 3003,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3003",
  },
});
