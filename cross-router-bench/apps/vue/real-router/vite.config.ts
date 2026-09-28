import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vueJsx()],
  // adapter dist + app must share ONE vue instance (reactivity/inject break otherwise)
  resolve: { dedupe: ["vue"] },
  build: { target: "es2022", minify: "esbuild" },
});
