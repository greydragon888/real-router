import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid({ ssr: true })],
  resolve: {
    conditions: ["development"],
    dedupe: ["solid-js"],
  },
  ssr: {
    // In dev, vite-plugin-solid externalizes the adapter's own dependencies
    // (@real-router/sources, @real-router/route-utils), and Node loads them
    // with a second copy of the workspace-linked @real-router/core, which
    // refuses routers the inlined copy built. Inlining every @real-router
    // package keeps one core. An app that installs the packages from npm
    // needs no such entry: its @real-router/core is external as well.
    noExternal: [/^@real-router\//],
  },
});
