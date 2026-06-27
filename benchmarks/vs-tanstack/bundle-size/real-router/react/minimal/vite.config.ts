import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Bundle-size fixture: a full client app build (React + router + app bundled,
// minified, tree-shaken) so the emitted client JS reflects what a real consumer
// ships. Measured in raw/gzip/brotli by measure.mjs; gzip is the primary signal.
export default defineConfig({
  root: "./vs-tanstack/bundle-size/real-router/react/minimal",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2022",
    reportCompressedSize: false,
  },
});
