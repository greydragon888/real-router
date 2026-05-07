import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    conditions: ["development"],
    dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"],
  },
});
