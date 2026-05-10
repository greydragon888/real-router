import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
} from "@angular/ssr/node";
import {
  createHttpStatusSink,
  type HttpStatusSink,
} from "@real-router/angular/ssr";
import express from "express";

import { getCachePolicy } from "./router/cache-policies";

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

export const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable("x-powered-by");

// /__bench/* — instrumentation for the #598 e2e test. Loader fetches
// /__bench/slow-fetch with the AbortSignal that withTimeout passes in;
// the deadline (250 ms) elapses well before the endpoint responds (5 s),
// so the fetch is aborted at the network layer. req.on("close") here
// observes the disconnect and increments the counter exposed via
// /__bench/abort-count. Registered BEFORE the catch-all Angular handler.
let abortObserved = 0;
app.get("/__bench/slow-fetch", (request, response) => {
  const timer = setTimeout(() => {
    response.json({ ok: true });
  }, 5000);
  request.on("close", () => {
    if (!response.writableEnded) {
      clearTimeout(timer);
      abortObserved += 1;
    }
  });
});
app.get("/__bench/abort-count", (_request, response) => {
  response.json({ abortObserved });
});

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

// Strong ETag from the SSR'd body. SHA-256 truncated to 16 base64url
// chars — collision-resistant for any reasonable site size, 22-byte
// total wire footprint.
function computeStrongEtag(body: Uint8Array): string {
  const hash = createHash("sha256")
    .update(body)
    .digest("base64url")
    .slice(0, 16);

  return `"${hash}"`;
}

app.use((req, res, next) => {
  // AbortController per request — server fires .abort() if the client
  // disconnects mid-render (browser tab closed, fetch cancelled,
  // network drop). The signal is attached to the Express request so
  // app.config.ts's deps factory can read it and forward into the
  // Real-Router per-request dep map. Loaders then `getDep("abortSignal")`
  // — see /slow loader for the demonstrated pattern.
  const abortController = new AbortController();

  (req as { abortSignal?: AbortSignal }).abortSignal = abortController.signal;
  req.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  // Per-request HTTP status sink. `<http-status-code [code]="N"/>` writes
  // through `HTTP_STATUS_SINK` (provided per-request in `app.config.ts` via
  // a factory that reads this very sink off Angular's `REQUEST_CONTEXT`
  // token — the second arg to `AngularNodeAppEngine.handle`). After
  // Angular finishes rendering we read sink.code below and let it override
  // Angular's response.status — render-time status decision.
  //
  // Why REQUEST_CONTEXT and not REQUEST? `AngularNodeAppEngine.handle`
  // converts the Express IncomingMessage to a fresh Web `Request` object,
  // which discards every custom property attached to the original Node
  // request. `REQUEST_CONTEXT` is Angular's built-in DI hook for
  // per-request metadata exactly to bridge this gap.
  const httpStatusSink: HttpStatusSink = createHttpStatusSink();

  angularApp
    .handle(req, { httpStatusSink })
    .then(async (response) => {
      if (!response) {
        next();

        return;
      }

      // Buffer the SSR'd body so we can hash it for a strong ETag and
      // honour conditional GETs. AngularNodeAppEngine returns a Web
      // Response — ArrayBuffer copy is cheap because the body is
      // already a single string in memory (no chunked streaming here).
      const buffer = new Uint8Array(await response.arrayBuffer());

      // Per-route Cache-Control. Auth-sensitive paths get `private,
      // no-store`; public paths get long max-age + s-maxage. Combined
      // with ETag, even short max-age routes serve cheap 304s on
      // revalidate.
      const cacheControl = getCachePolicy(req.url ?? "/");

      // ETag is computed over the final SSR bytes — same input bytes
      // => same ETag, so two consecutive identical requests yield 304.
      // We use a STRONG etag (no W/ prefix) because the body is
      // byte-identical when the rendered output hasn't changed.
      const etag = computeStrongEtag(buffer);
      const ifNoneMatch = req.headers["if-none-match"];

      // Mirror the Web Response headers onto Node res first.
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      res.setHeader("ETag", etag);
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }

      if (ifNoneMatch === etag) {
        res.statusCode = 304;
        res.end();

        return;
      }

      // Render-time status override: <http-status-code> writes the desired
      // code into httpStatusSink during rendering; here we honour it (else
      // fall back to Angular's response.status). Loader-driven errors fall
      // through to the catch branch below, so this only applies to the
      // happy path + render-time decisions like the NotFound page.
      res.statusCode = httpStatusSink.code ?? response.status;
      res.end(buffer);
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
        res.status(404).type("text/plain; charset=utf-8").send("Not Found");

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
  const port = Number(process.env.PORT) || 4173;

  app.listen(port, () => {
    console.log(`Angular SSR server: http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
