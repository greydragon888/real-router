import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

// Same Solid config as the other engines: vite-plugin-solid compiles JSX (app
// + @tanstack/solid-router source via the "solid" condition), one solid-js.
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["solid"], dedupe: ["solid-js"] },
  build: { target: "es2022", minify: "esbuild" },
});
