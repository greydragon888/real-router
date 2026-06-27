import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "./vs-tanstack/loader-data-retention/real-router/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/loader-data-retention/real-router/vue/app.ts",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (loader-data-retention real-router-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
