import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// "real-router-full" — REFERENCE variant (interceptor-depth measurement note):
// the same base app wired with a realistic production plugin STACK
// (browser + persistent-params + search-schema + ssr-data), so a one-off run
// quantifies "the cost of enabled capabilities" over the bare real-router cell.
// NOT part of run-all / REPORT engine rosters (apples-to-oranges vs bare
// competitors) — run manually:
//   node cross-router/run.mjs nav-latency real-router-full react 50
//   node cross-router/run.mjs param-nav  real-router-full react 50
// Same build settings as the base variant (production dist, esbuild minify).
export default defineConfig({
  plugins: [react()],
  build: { target: "es2022", minify: "esbuild" },
});
