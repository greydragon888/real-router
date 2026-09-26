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
    conditions: ["development"],
    dedupe: ["solid-js"],
  },
});
