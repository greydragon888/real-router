import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
  },
  build: {
    outDir: "./vs-tanstack/interrupted-navigations/tanstack/solid/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/interrupted-navigations/tanstack/solid/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (interrupted-navigations tanstack-solid)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
