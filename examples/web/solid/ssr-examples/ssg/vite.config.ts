import { extname } from "node:path";

import solid from "vite-plugin-solid";
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
  plugins: [solid({ ssr: true }), ssgServe()],
  appType: "mpa",
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
