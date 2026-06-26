import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
  },
  build: {
    outDir: "./vs-tanstack/client-nav/real-router/solid/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/client-nav/real-router/solid/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (real-router-solid)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
