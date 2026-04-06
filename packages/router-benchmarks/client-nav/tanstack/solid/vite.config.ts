import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
  },
  build: {
    outDir: "./client-nav/tanstack/solid/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./client-nav/tanstack/solid/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/client-nav (tanstack-solid)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./client-nav/vitest.setup.ts"],
  },
});
