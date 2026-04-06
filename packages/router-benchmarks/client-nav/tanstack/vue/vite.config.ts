import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue(), vueJsx()],
  build: {
    outDir: "./client-nav/tanstack/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./client-nav/tanstack/vue/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/client-nav (tanstack-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./client-nav/vitest.setup.ts"],
  },
});
