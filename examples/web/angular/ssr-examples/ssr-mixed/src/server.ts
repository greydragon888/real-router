import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
} from "@angular/ssr/node";
import { UNKNOWN_ROUTE } from "@real-router/core";
import {
  createRequestScope,
  serializeRouterState,
} from "@real-router/ssr-utils";
import {
  getSsrDataMode,
  ssrDataPluginFactory,
} from "@real-router/ssr-data-plugin";
import express from "express";

import { createBaseRouter } from "./router/createBaseRouter";
import { loaders } from "./router/loaders";

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

export const app = express();
const angularApp = new AngularNodeAppEngine();
const baseRouter = createBaseRouter();

app.disable("x-powered-by");

app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

function escapeHtmlAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/**
 * Mode-branching middleware. Resolves the per-route SSR mode via the same
 * `ssrDataPluginFactory` used inside the Angular app, then short-circuits
 * non-`"full"` modes by emitting shell HTML directly (no Angular bootstrap).
 * `"full"` requests fall through to the AngularNodeAppEngine middleware
 * below, which runs the canonical SSR pipeline.
 */
app.use((req, res, next) => {
  const url = req.originalUrl ?? req.url ?? "/";
  // createRequestScope: AbortController + req.on("close") + cloneRouter +
  // dispose, all in one. abortSignal is injected into deps so loaders can
  // read getDep("abortSignal") for cooperative cancellation when the
  // client disconnects mid-render.
  const scope = createRequestScope(req, baseRouter);

  scope.router.usePlugin(ssrDataPluginFactory(loaders));

  scope.router
    .start(url)
    .then((state) => {
      if (state.name === UNKNOWN_ROUTE) {
        // Let Angular render the not-found component on its UNKNOWN_ROUTE pass.
        next();

        return;
      }

      const mode = getSsrDataMode(state);

      if (mode === "full") {
        next();

        return;
      }

      const json = serializeRouterState(state);
      const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SSR Mixed Mode (Angular)</title>
  </head>
  <body>
    <div data-ssr-shell data-ssr-mode="${escapeHtmlAttribute(mode)}">SSR mode: ${mode}</div>
    <script>window.__SSR_STATE__=${json}</script>
  </body>
</html>`;

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(shell);
    })
    .catch((error: unknown) => {
      next(error);
    })
    .finally(() => {
      void scope.dispose();
    });
});

// Angular SSR middleware — only reached when mode === "full" (or for the
// not-found pass).
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (!response) {
        next();

        return;
      }

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      res.statusCode = response.status;
      void response.arrayBuffer().then((buffer) => {
        res.end(new Uint8Array(buffer));
      });
    })
    .catch((error: unknown) => {
      next(error);
    });
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;

  app.listen(port, () => {
    console.log(`Angular SSR (mixed mode): http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
