import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "./client-nav/real-router/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./client-nav/real-router/vue/app.ts",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/client-nav (real-router-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./client-nav/vitest.setup.ts"],
  },
});
