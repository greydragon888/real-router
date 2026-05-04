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

interface MaybeRedirect {
  code?: string;
  target?: string;
  status?: number;
}

interface MaybeError {
  code?: string;
}

function readErrorCode(error: unknown): string | undefined {
  return (error as MaybeError | null)?.code;
}

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
      const code = readErrorCode(error);

      if (code === "CANNOT_ACTIVATE") {
        res.redirect(302, "/");

        return;
      }

      if (code === "LOADER_REDIRECT") {
        const redirect = error as MaybeRedirect;
        const target = redirect.target ?? "/";
        const status = redirect.status ?? 302;

        res.redirect(status, target);

        return;
      }

      if (code === "LOADER_NOT_FOUND") {
        res
          .status(404)
          .type("text/plain; charset=utf-8")
          .send("Not Found");

        return;
      }

      if (code === "LOADER_TIMEOUT") {
        res
          .status(504)
          .type("text/plain; charset=utf-8")
          .send("Gateway Timeout");

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
