import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Top-level `await` in <script> blocks is experimental in Svelte
        // 5.x — the compiler refuses it without this flag. The flag itself
        // is documented under the same name in the Svelte 5 changelog;
        // expect it to graduate to stable in a future minor release. We
        // need it to demonstrate <svelte:boundary pending> with a child
        // that pauses on top-level await — see ServerStats.svelte.
        experimental: { async: true },
      },
    }),
  ],
  resolve: {
    // See examples/web/svelte/ssr-examples/ssr/vite.config.ts for the
    // rationale: do not override Vite's default conditions or the client
    // build resolves `import { hydrate } from "svelte"` to the SSR runtime.
    dedupe: ["svelte"],
  },
});
