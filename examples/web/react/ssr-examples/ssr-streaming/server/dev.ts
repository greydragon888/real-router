import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

import { getCachePolicy } from "../src/router/cache-policies";

import type { RenderResult } from "../src/entry-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function startDevServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.get("/{*path}", async (request, response, next) => {
    const url = request.originalUrl;

    try {
      let template = readFileSync(path.resolve(root, "index.html"), "utf8");

      template = await vite.transformIndexHtml(url, template);

      const module_ = (await vite.ssrLoadModule("/src/entry-server.tsx")) as {
        render: (
          url: string,
          ctx: { req: import("node:http").IncomingMessage },
        ) => Promise<RenderResult>;
      };

      const result = await module_.render(url, { req: request });
      const {
        ssrJson,
        statusCode,
        cleanup,
        stream,
        rawBody,
        contentType,
        signal,
      } = result;

      // Typed loader errors short-circuit to plain-text before stream
      // construction — same path as production server.
      if (rawBody !== undefined) {
        response
          .status(statusCode)
          .set("Content-Type", contentType ?? "text/plain; charset=utf-8")
          .send(rawBody);
        await cleanup();

        return;
      }

      if (!stream) {
        throw new Error("render() returned no stream and no rawBody");
      }

      const ssrScript = `<script>window.__SSR_STATE__=${ssrJson}</script>`;
      const templateWithState = template.replace("<!--ssr-state-->", ssrScript);
      const [headPart, footerPart] =
        templateWithState.split("<!--ssr-outlet-->");

      const cacheControl = getCachePolicy(url);

      response.status(statusCode);
      response.set("Content-Type", "text/html; charset=utf-8");
      response.set("Transfer-Encoding", "chunked");
      if (cacheControl) {
        response.set("Cache-Control", cacheControl);
      }

      response.write(headPart);

      const reader = stream.getReader();

      try {
        for (;;) {
          if (signal.aborted) {
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

      await cleanup();
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      next(error);
    }
  });

  const port = 3000;

  app.listen(port, () => {
    console.log(`[dev] http://localhost:${port}`);
  });
}

void startDevServer();
