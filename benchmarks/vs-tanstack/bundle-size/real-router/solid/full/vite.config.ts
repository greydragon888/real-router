import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  root: "./vs-tanstack/bundle-size/real-router/solid/full",
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2022",
    reportCompressedSize: false,
  },
});
