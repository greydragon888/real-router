import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { getCachePolicy } from "../src/router/cache-policies";

import type { RenderResult } from "../src/entry-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  app.use(express.static(path.resolve(root, "dist/client"), { index: false }));

  const template = readFileSync(
    path.resolve(root, "dist/client/index.html"),
    "utf8",
  );

  const module_ = (await import(
    path.resolve(root, "dist/server/entry-server.js")
  )) as {
    render: (url: string) => Promise<RenderResult>;
  };

  app.get("/{*path}", async (request, response, next) => {
    const url = request.originalUrl;

    // AbortController per request — fired on client disconnect. Used
    // to bail out of the stream-pump loop early (otherwise we'd keep
    // pulling chunks from the ReadableStream and discarding them).
    // Also propagated to ssrDataPlugin loaders via cloneRouter deps —
    // see entry-server.ts. Note: ETag/If-None-Match is intentionally
    // NOT wired here. Computing a strong ETag requires hashing the
    // full body; in a streaming pipeline the body never exists in
    // memory as a single buffer, so honouring conditional GETs would
    // mean buffering the whole stream first — which defeats the
    // streaming purpose. See `cache-policies.ts` for the full
    // rationale.
    const abortController = new AbortController();

    request.on("close", () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    let cleanup: (() => void) | undefined;

    try {
      const result = await module_.render(url);

      cleanup = result.cleanup;

      // Typed loader errors (LoaderNotFound) short-circuit before the
      // stream is constructed — emit plain-text and skip pumping.
      if (result.rawBody !== undefined) {
        response
          .status(result.statusCode)
          .set(
            "Content-Type",
            result.contentType ?? "text/plain; charset=utf-8",
          )
          .send(result.rawBody);

        return;
      }

      if (!result.stream) {
        throw new Error("render() returned no stream and no rawBody");
      }

      const ssrScript = `<script>window.__SSR_STATE__=${result.ssrJson}</script>`;
      const templateWithState = template.replace("<!--ssr-state-->", ssrScript);
      const [headPart, footerPart] =
        templateWithState.split("<!--ssr-outlet-->");

      const cacheControl = getCachePolicy(url);

      response.status(result.statusCode);
      response.set("Content-Type", "text/html; charset=utf-8");
      response.set("Transfer-Encoding", "chunked");
      if (cacheControl) {
        response.set("Cache-Control", cacheControl);
      }

      response.write(headPart);

      const reader = result.stream.getReader();

      try {
        for (;;) {
          if (abortController.signal.aborted) {
            break;
          }

          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (response.writableEnded) {
            break;
          }

          response.write(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }

      if (!response.writableEnded) {
        response.write(footerPart);
        response.end();
      }
    } catch (error) {
      console.error(error);
      next(error);
    } finally {
      cleanup?.();
    }
  });

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[prod] http://localhost:${port}`);
  });
}

void startServer();
