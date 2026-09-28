import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

// Same Solid config as the real-router app: vite-plugin-solid compiles JSX (app
// + @solidjs/router source via the "solid" condition), one solid-js instance.
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["solid"], dedupe: ["solid-js"] },
  build: { target: "es2022", minify: "esbuild" },
});
