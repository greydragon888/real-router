import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // Top-level `await` is gated behind this experimental compiler flag in
  // Svelte 5.54.x — both vite-plugin-svelte and svelte-check read this
  // file, so the flag must live here (not just in vite.config.ts).
  // ServerStats.svelte uses top-level await to demonstrate
  // <svelte:boundary pending>.
  compilerOptions: {
    experimental: { async: true },
  },
};
