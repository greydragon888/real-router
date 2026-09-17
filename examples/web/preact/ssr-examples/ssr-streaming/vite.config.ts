import { preact } from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    conditions: ["development"],
    dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"],
  },
});
