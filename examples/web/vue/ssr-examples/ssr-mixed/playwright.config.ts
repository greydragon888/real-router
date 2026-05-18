import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && PORT=3014 pnpm preview",
    port: 3014,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3014",
  },
});
