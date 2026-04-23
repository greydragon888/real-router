import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development"],
    dedupe: ["solid-js"],
  },
});

