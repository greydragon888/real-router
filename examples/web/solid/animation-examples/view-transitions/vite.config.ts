import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development"],
    dedupe: ["solid-js"],
  },
  preview: {
    port: 4249,
  },
});
