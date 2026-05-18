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
  signal: AbortSignal;
  cleanup: () => Promise<void>;
  rawBody?: string;
  contentType?: string;
  deferBootstrap: string;
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
    render: (
      url: string,
      ctx: { req: import("node:http").IncomingMessage },
    ) => Promise<RenderResult>;
  };

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;
    const result = await module_.render(url, { req: request });

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
      const templateWithBootstrap = template.replace(
        "<!--defer-bootstrap-->",
        result.deferBootstrap,
      );
      const [head, tail] = templateWithBootstrap.split("<!--ssr-outlet-->");
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
          if (result.signal.aborted) {
            break;
          }

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
      await result.cleanup();
    }
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Production server: http://localhost:${port}`);
  });
}

void startServer();
