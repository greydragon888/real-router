import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

// Solid apps: vite-plugin-solid compiles the app's JSX; `dedupe: ["solid-js"]`
// guarantees ONE solid-js runtime instance across the app + @real-router/solid
// (a duplicate breaks Solid's reactive context — same class of bug the preact
// cohort hit). `conditions: ["solid"]` selects solid-js's client build.
// @real-router/solid resolves through its own "solid" export condition to
// dist/source, which this build compiles — the published adapter, compiled the
// way this cohort's competitors (@solidjs/router, @tanstack/solid-router) are.
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["solid"], dedupe: ["solid-js"] },
  build: { target: "es2022", minify: "esbuild" },
});
