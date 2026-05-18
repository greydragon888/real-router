import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser", "development"],
    dedupe: ["svelte"],
  },
  preview: {
    port: 4260,
  },
});
