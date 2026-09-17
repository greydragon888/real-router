import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- TAURI_DEV_HOST only picks the dev server's host, which no build output depends on
    host: process.env.TAURI_DEV_HOST || false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    conditions: ["development"],
  },
});
