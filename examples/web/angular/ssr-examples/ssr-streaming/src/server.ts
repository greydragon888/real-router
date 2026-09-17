import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express, { static as serveStatic } from "express";

const serverDistFolder = path.dirname(fileURLToPath(import.meta.url));
const browserDistFolder = path.resolve(serverDistFolder, "../browser");

export const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable("x-powered-by");

app.use(
  serveStatic(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

app.use((request, nodeResponse, next) => {
  angularApp
    .handle(request)
    .then((response) => {
      if (response) {
        writeResponseToNodeResponse(response, nodeResponse);
      } else {
        next();
      }
    })
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- PORT is conventional Express override, not turbo task input
  const port = Number(process.env.PORT) || 4173;

  app.listen(port, () => {
    console.log(`Angular SSR streaming server: http://localhost:${port}`);
  });
}

export const requestHandler = createNodeRequestHandler(app);
