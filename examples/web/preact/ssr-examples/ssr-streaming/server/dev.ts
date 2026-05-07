import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

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

  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;

    try {
      let template = readFileSync(path.resolve(root, "index.html"), "utf8");

      template = await vite.transformIndexHtml(url, template);

      const module_ = (await vite.ssrLoadModule("/src/entry-server.tsx")) as {
        render: (url: string) => Promise<RenderResult>;
      };

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

        // Split the template at the SSR outlet. Send the prelude (head +
        // open root div) immediately, then pipe the streaming HTML, then
        // send the postlude (close + state + script tags).
        const stateScript = `<script>window.__SSR_STATE__=${result.ssrJson}</script>`;
        const [head, tail] = template.split("<!--ssr-outlet-->");
        const finalTail = (tail ?? "").replace("<!--ssr-state-->", stateScript);

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
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      response.status(500).send((error as Error).message);
    }
  });

  const port = 3000;

  app.listen(port, () => {
    console.log(`Dev server: http://localhost:${port}`);
  });
}

void startServer();
