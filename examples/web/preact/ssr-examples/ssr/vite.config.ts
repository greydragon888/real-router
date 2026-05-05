import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    conditions: ["development"],
    // Dedupe preact across monorepo workspace deps. Without this,
    // @real-router/preact's preact peer can resolve to a different
    // copy than the app's preact, producing two hook runtimes in the
    // bundle and crashes like "Cannot read properties of undefined
    // (reading '__H')" during hydration.
    dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"],
  },
});
