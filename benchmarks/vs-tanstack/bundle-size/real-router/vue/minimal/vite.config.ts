import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Bundle-size fixture: a full client app build (Vue + router + app bundled,
// minified, tree-shaken) so the emitted client JS reflects what a real consumer
// ships. Measured in raw/gzip/brotli by measure.mjs; gzip is the primary signal.
export default defineConfig({
  root: "./vs-tanstack/bundle-size/real-router/vue/minimal",
  plugins: [vue()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2022",
    reportCompressedSize: false,
  },
});
