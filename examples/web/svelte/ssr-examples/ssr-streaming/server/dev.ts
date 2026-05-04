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

      const module_ = (await vite.ssrLoadModule("/src/entry-server.ts")) as {
        renderPage: (url: string) => Promise<RenderResult>;
      };

      const result = await module_.renderPage(url);

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

      const ssrScript = `<script>window.__SSR_STATE__=${result.ssrJson}</script>`;
      const page = template
        .replace("<!--ssr-head-->", result.head)
        .replace("<!--ssr-outlet-->", result.html)
        .replace("<!--ssr-state-->", ssrScript);

      response
        .status(result.statusCode)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(page);
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
