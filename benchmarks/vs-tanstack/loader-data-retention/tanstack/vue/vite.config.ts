import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue(), vueJsx()],
  build: {
    outDir: "./vs-tanstack/loader-data-retention/tanstack/vue/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/loader-data-retention/tanstack/vue/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (loader-data-retention tanstack-vue)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
