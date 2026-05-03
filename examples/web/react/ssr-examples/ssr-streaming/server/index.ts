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

  app.get("/{*path}", async (request, response, next) => {
    const url = request.originalUrl;

    try {
      const { stream, ssrJson, statusCode, cleanup } =
        await module_.render(url);

      const ssrScript = `<script>window.__SSR_STATE__=${ssrJson}</script>`;
      const templateWithState = template.replace("<!--ssr-state-->", ssrScript);
      const [headPart, footerPart] =
        templateWithState.split("<!--ssr-outlet-->");

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

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[prod] http://localhost:${port}`);
  });
}

void startServer();
