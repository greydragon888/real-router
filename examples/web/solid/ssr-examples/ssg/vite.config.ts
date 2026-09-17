import path from "node:path";

import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

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
