import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid({ ssr: true })],
  resolve: {
    // See ../ssr/vite.config.ts for the rationale on these conditions:
    // resolves @real-router/solid to its src/*.tsx so the SSR build
    // recompiles the adapter with SSR codegen instead of pulling in the
    // pre-compiled DOM bundle.
    conditions: ["@real-router/internal-source", "development"],
    dedupe: ["solid-js"],
  },
  ssr: {
    resolve: {
      conditions: ["@real-router/internal-source", "development"],
    },
    noExternal: ["@real-router/solid"],
  },
});
