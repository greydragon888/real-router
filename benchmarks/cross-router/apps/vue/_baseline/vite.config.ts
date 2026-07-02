import vueJsx from "@vitejs/plugin-vue-jsx";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [vueJsx()], build: { target: "es2022", minify: "esbuild" } });
