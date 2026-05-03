import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid({ ssr: true })],
  resolve: {
    // See examples/web/solid/ssr-examples/ssr/vite.config.ts for the
    // rationale: internal-source resolves @real-router/solid to its .tsx
    // source so vite-plugin-solid can recompile it for the SSR codegen.
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
