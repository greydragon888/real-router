import { extname } from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function ssgServe(): Plugin {
  return {
    name: "ssg-serve",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        if (!url.endsWith("/") && !extname(url)) {
          res.writeHead(301, { Location: url + "/" });
          res.end();
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
