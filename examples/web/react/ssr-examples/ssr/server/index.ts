import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { getCurrentUserFromCookies } from "./_auth";
import { getCachePolicy } from "../src/router/cache-policies";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Strong ETag from the SSR'd HTML body. SHA-256 truncated to 16
// base64url chars — collision-resistant for any reasonable site size,
// 22-byte total wire footprint.
function computeStrongEtag(body: string): string {
  const hash = createHash("sha256")
    .update(body)
    .digest("base64url")
    .slice(0, 16);

  return `"${hash}"`;
}

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  // /__bench/* — instrumentation for the #598 e2e test.
  // /slow loader fetches /__bench/slow-fetch with the AbortSignal that
  // withTimeout passes in. The deadline (250 ms) elapses well before
  // /__bench/slow-fetch responds (5 s), so the fetch is aborted at the
  // network layer — request.on("close") fires here and increments the
  // counter that the test reads via /__bench/abort-count.
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

  app.use(express.static(path.resolve(root, "dist/client"), { index: false }));

  const template = readFileSync(
    path.resolve(root, "dist/client/index.html"),
    "utf8",
  );

  const module_ = (await import(
    path.resolve(root, "dist/server/entry-server.js")
  )) as {
    render: (
      url: string,
      ctx: {
        currentUser: {
          id: string;
          name: string;
          role: "admin" | "user";
        } | null;
        abortSignal?: AbortSignal;
      },
    ) => Promise<{
      html: string;
      serializedData: string;
      statusCode: number;
      redirect: string | null;
      head: string;
      rawBody?: string;
      contentType?: string;
    }>;
  };

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;
    const currentUser = getCurrentUserFromCookies(request.headers.cookie);

    // AbortController per request — server fires .abort() if the client
    // disconnects mid-render (browser tab closed, fetch cancelled,
    // network drop). Loaders can listen via getDep("abortSignal") to
    // cancel pending I/O — see /slow loader for the demonstrated
    // pattern. Without this wiring a 5 s loader would hold the worker
    // for the full delay even after the client gave up.
    const abortController = new AbortController();

    request.on("close", () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    const result = await module_.render(url, {
      currentUser,
      abortSignal: abortController.signal,
    });

    if (result.redirect) {
      response.redirect(result.statusCode, result.redirect);

      return;
    }

    if (result.rawBody !== undefined) {
      response
        .status(result.statusCode)
        .set("Content-Type", result.contentType ?? "text/plain; charset=utf-8")
        .send(result.rawBody);

      return;
    }

    const page = template
      .replace("<!--ssr-meta-->", result.head)
      .replace("<!--ssr-outlet-->", result.html)
      .replace("<!--ssr-state-->", result.serializedData);

    // ETag is computed over the final HTML — same input bytes => same
    // ETag, so two consecutive identical requests yield 304. We use a
    // STRONG etag (no W/ prefix) because the body is byte-identical
    // when state.context.data hasn't changed.
    const etag = computeStrongEtag(page);
    const ifNoneMatch = request.headers["if-none-match"];

    // Per-route Cache-Control. Auth-sensitive paths get `private, no-
    // store`; public paths get long max-age + s-maxage. Combined with
    // ETag, even short max-age routes serve cheap 304s on revalidate.
    const cacheControl = getCachePolicy(url);

    response.set("ETag", etag);
    if (cacheControl) {
      response.set("Cache-Control", cacheControl);
    }

    if (ifNoneMatch === etag) {
      response.status(304).end();

      return;
    }

    response
      .status(result.statusCode)
      .set("Content-Type", "text/html")
      .send(page);
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Production server: http://localhost:${port}`);
  });
}

void startServer();
