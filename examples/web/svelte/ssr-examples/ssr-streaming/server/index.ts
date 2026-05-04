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
    renderPage: (url: string) => Promise<RenderResult>;
  };

  app.get("/{*path}", async (request, response, next) => {
    const url = request.originalUrl;

    try {
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
