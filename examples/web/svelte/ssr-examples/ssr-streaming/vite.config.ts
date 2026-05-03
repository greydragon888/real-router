import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // See examples/web/svelte/ssr-examples/ssr/vite.config.ts for the
    // rationale: do not override Vite's default conditions or the client
    // build resolves `import { hydrate } from "svelte"` to the SSR runtime.
    dedupe: ["svelte"],
  },
});
