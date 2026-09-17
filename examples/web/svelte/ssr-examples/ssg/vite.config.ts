import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function ssgServe(): Plugin {
  return {
    name: "ssg-serve",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";

        if (!url.endsWith("/") && !path.extname(url)) {
          response.writeHead(301, { Location: `${url}/` });
          response.end();

          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), ssgServe()],
  appType: "mpa",
  resolve: {
    // See examples/web/svelte/ssr-examples/ssr/vite.config.ts for the
    // rationale: do not override Vite's default conditions.
    dedupe: ["svelte"],
  },
});
