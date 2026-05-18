import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build:app && pnpm preview --port 4227",
    url: "http://localhost:4227/",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4227",
  },
});
