import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && PORT=3007 pnpm preview",
    port: 3007,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3007",
  },
});
