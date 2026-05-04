import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

export const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable("x-powered-by");

app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (response) {
        writeResponseToNodeResponse(response, res);
      } else {
        next();
      }
    })
    .catch((error: unknown) => {
      const code = (error as { code?: string } | null)?.code;

      if (code === "CANNOT_ACTIVATE") {
        res.redirect(302, "/");

        return;
      }

      next(error);
    });
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env["PORT"]) || 4173;

  app.listen(port, () => {
    console.log(`Angular SSR server: http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
