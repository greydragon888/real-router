/**
 * PoC prebuild: bundles app.tsx (React app + adapter + memory-plugin +
 * react-dom, production mode) into ONE self-contained ESM file that the
 * bench process imports after installing jsdom globals.
 *
 * `@real-router/internal-source` is prepended to resolve.conditions so the
 * bundle measures live `src/` (same philosophy as the core gate; also the
 * only option in a fresh worktree where `dist/` was never built).
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["@real-router/internal-source"],
  },
  build: {
    outDir: "adapter-bench-poc/dist",
    emptyOutDir: true,
    minify: false,
    target: "node20",
    lib: {
      entry: "adapter-bench-poc/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
    rollupOptions: {
      // bundle EVERYTHING (react, react-dom, adapter, core, plugins) —
      // the bench process must import one file with zero resolution magic.
      external: [],
    },
  },
});
