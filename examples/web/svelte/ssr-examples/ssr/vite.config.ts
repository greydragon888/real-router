import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // Do NOT set `conditions: ["development"]` here — it replaces Vite's
    // default condition list, so the client build loses the implicit
    // `"browser"` condition. svelte's package.json maps the `"."` export to
    // `index-server.js` under `default`, where `hydrate()`/`mount()` throw
    // `lifecycle_function_unavailable`. Letting Vite supply "browser" for
    // the client build and "node" for the SSR build is what routes
    // `import { hydrate } from "svelte"` to the correct runtime per target.
    dedupe: ["svelte"],
  },
});
