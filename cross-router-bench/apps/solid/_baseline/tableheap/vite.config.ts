import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["solid"], dedupe: ["solid-js"] },
  build: { target: "es2022", minify: "esbuild" },
});
