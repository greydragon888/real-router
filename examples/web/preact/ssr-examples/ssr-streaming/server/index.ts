import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { getCachePolicy } from "../src/router/cache-policies";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

interface RenderResult {
  stream?: ReadableStream<Uint8Array>;
  ssrJson: string;
  statusCode: number;
  cleanup: () => void;
  rawBody?: string;
  contentType?: string;
}

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

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;
    const result = await module_.render(url);

    try {
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

      const stateScript = `<script>window.__SSR_STATE__=${result.ssrJson}</script>`;
      const [head, tail] = template.split("<!--ssr-outlet-->");
      const finalTail = (tail ?? "").replace("<!--ssr-state-->", stateScript);

      const cacheControl = getCachePolicy(url);

      if (cacheControl) {
        response.set("Cache-Control", cacheControl);
      }

      response.status(result.statusCode).set("Content-Type", "text/html");
      response.write(head ?? "");

      if (result.stream) {
        const reader = result.stream.getReader();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          response.write(value);
        }
      }

      response.write(finalTail);
      response.end();
    } finally {
      result.cleanup();
    }
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Production server: http://localhost:${port}`);
  });
}

void startServer();
