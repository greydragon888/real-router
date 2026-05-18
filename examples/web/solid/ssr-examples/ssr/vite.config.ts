import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid({ ssr: true })],
  resolve: {
    // `@real-router/internal-source` resolves @real-router/solid (and other
    // adapter packages) to their ./src/*.tsx source instead of the
    // published dist/ output. Without it, the dist bundle compiled with
    // `generate: 'dom'` is picked up — its module init calls
    // `solid-js/web.template()` (a client-only API) and the SSR build
    // crashes with "Client-only API called on the server side" before the
    // first request.
    conditions: ["@real-router/internal-source", "development"],
    dedupe: ["solid-js"],
  },
  ssr: {
    // Vite resolves SSR builds through ssr.resolve.conditions, not
    // resolve.conditions. We need internal-source on both so the SSR
    // bundle picks up source .tsx (recompiled via vite-plugin-solid with
    // SSR codegen) instead of the dist DOM bundle.
    resolve: {
      conditions: ["@real-router/internal-source", "development"],
    },
    // Force Vite to traverse the adapter source through vite-plugin-solid
    // instead of leaving it as an external Node import.
    noExternal: ["@real-router/solid"],
  },
});
