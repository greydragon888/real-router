import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["development"],
    dedupe: ["svelte"],
  },
  preview: {
    port: 4173,
  },
});
