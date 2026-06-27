import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue(), vueJsx()],
  build: {
    outDir: "./vs-tanstack/interrupted-navigations/tanstack/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/interrupted-navigations/tanstack/vue/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (interrupted-navigations tanstack-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
