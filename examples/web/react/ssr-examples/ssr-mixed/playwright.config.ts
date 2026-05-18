import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && PORT=3004 pnpm preview",
    port: 3004,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3004",
  },
});
