import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

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

  // HEAD requests must NOT trigger the streaming pipeline. CDN probes,
  // health checks, and clients using `fetch(method: "HEAD")` only need
  // response headers — running renderToStream just to discard the body
  // wastes CPU and prolongs Suspense awaits. Send a minimal 200 with
  // the right Content-Type and exit. Production HEAD handling could
  // mirror GET status codes (loader 404 → 404, etc.) but for the demo
  // a fixed 200 is sufficient to prove the early-exit contract.
  app.head("/{*path}", (_request, response) => {
    response.status(200).set("Content-Type", "text/html; charset=utf-8").end();
  });

  app.get("/{*path}", async (request, response, next) => {
    const url = request.originalUrl;

    try {
      const result = await module_.render(url);

      // Typed loader-error short-circuit (e.g. LoaderNotFound for an
      // unknown product id). Skip the streaming pipeline entirely and
      // send a plain text/plain body with the right status.
      if (result.rawBody !== undefined) {
        response
          .status(result.statusCode)
          .set(
            "Content-Type",
            result.contentType ?? "text/plain; charset=utf-8",
          )
          .send(result.rawBody);
        result.cleanup();

        return;
      }

      const { stream, ssrJson, hydrationScript, statusCode, cleanup } = result;

      const ssrScript = `<script>window.__SSR_STATE__=${ssrJson}</script>`;
      const templateWithStateAndHydration = template
        .replace("<!--ssr-hydration-script-->", hydrationScript)
        .replace("<!--ssr-state-->", ssrScript);
      const [headPart, footerPart] =
        templateWithStateAndHydration.split("<!--ssr-outlet-->");

      response.status(statusCode);
      response.set("Content-Type", "text/html; charset=utf-8");
      response.set("Transfer-Encoding", "chunked");
      response.write(headPart);

      const reader = stream.getReader();

      try {
        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          response.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }

      response.write(footerPart);
      response.end();
      cleanup();
    } catch (error) {
      console.error(error);
      next(error);
    }
  });

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[prod] http://localhost:${port}`);
  });
}

void startServer();
