import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
  },
  build: {
    outDir: "./client-nav/real-router/solid/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./client-nav/real-router/solid/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/client-nav (real-router-solid)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./client-nav/vitest.setup.ts"],
  },
});
