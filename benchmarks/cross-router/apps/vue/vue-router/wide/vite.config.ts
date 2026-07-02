import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [vueJsx()], resolve: { dedupe: ["vue"] }, build: { target: "es2022", minify: "esbuild" } });
