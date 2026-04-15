import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "./vs-tanstack/real-router/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/real-router/vue/app.ts",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (real-router-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/vitest.setup.ts"],
  },
});
