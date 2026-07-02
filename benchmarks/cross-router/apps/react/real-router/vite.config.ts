import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Production build of the PRODUCTION real-router dist (default `import` condition
// → dist/esm). No "development" condition (examples use it for dev DX; here we
// want the real shipped bytes/perf). Fair 1:1 vs react-router prod build.
export default defineConfig({
  plugins: [react()],
  build: { target: "es2022", minify: "esbuild" },
});
