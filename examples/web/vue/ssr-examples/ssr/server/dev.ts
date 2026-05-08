import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

import { getCurrentUserFromCookies } from "./_auth";
import { getCachePolicy } from "../src/router/cache-policies";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);

  // /__bench/* — instrumentation for the #598 e2e test (mirror of server/index.ts).
  let abortObserved = 0;
  app.get("/__bench/slow-fetch", (request, response) => {
    const timer = setTimeout(() => {
      response.json({ ok: true });
    }, 5000);
    request.on("close", () => {
      if (!response.writableEnded) {
        clearTimeout(timer);
        abortObserved += 1;
      }
    });
  });
  app.get("/__bench/abort-count", (_request, response) => {
    response.json({ abortObserved });
  });

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;

    try {
      let template = readFileSync(path.resolve(root, "index.html"), "utf8");

      template = await vite.transformIndexHtml(url, template);

      const module_ = (await vite.ssrLoadModule("/src/entry-server.ts")) as {
        render: (
          url: string,
          ctx: {
            currentUser: {
              id: string;
              name: string;
              role: "admin" | "user";
            } | null;
            req: import("node:http").IncomingMessage;
          },
        ) => Promise<{
          html: string;
          serializedData: string;
          statusCode: number;
          redirect: string | null;
          head: string;
          rawBody?: string;
          contentType?: string;
        }>;
      };

      const currentUser = getCurrentUserFromCookies(request.headers.cookie);

      const result = await module_.render(url, {
        currentUser,
        req: request,
      });

      if (result.redirect) {
        response.redirect(result.statusCode, result.redirect);

        return;
      }

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

      const page = template
        .replace("<!--ssr-meta-->", result.head)
        .replace("<!--ssr-outlet-->", result.html)
        .replace("<!--ssr-state-->", result.serializedData);

      const cacheControl = getCachePolicy(url);

      if (cacheControl) {
        response.set("Cache-Control", cacheControl);
      }

      response
        .status(result.statusCode)
        .set("Content-Type", "text/html")
        .send(page);
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
