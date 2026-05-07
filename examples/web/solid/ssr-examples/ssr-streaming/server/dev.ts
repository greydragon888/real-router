import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

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
        render: (url: string) => Promise<RenderResult>;
      };

      const result = await module_.render(url);

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
