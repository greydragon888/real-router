import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && PORT=3011 pnpm preview",
    port: 3011,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3011",
  },
});
