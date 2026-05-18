import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    dedupe: ["svelte"],
  },
  preview: {
    port: 4265,
  },
});
