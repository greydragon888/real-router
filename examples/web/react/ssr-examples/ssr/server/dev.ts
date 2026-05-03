import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createServer as createViteServer } from "vite";

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

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;

    try {
      let template = readFileSync(path.resolve(root, "index.html"), "utf8");

      template = await vite.transformIndexHtml(url, template);

      const module_ = (await vite.ssrLoadModule("/src/entry-server.tsx")) as {
        render: (
          url: string,
          ctx: { isAuthenticated: boolean },
        ) => Promise<{
          html: string;
          serializedData: string;
          statusCode: number;
          redirect: string | null;
        }>;
      };

      const isAuthenticated =
        request.headers.cookie?.includes("auth=1") ?? false;

      const result = await module_.render(url, { isAuthenticated });

      if (result.redirect) {
        response.redirect(result.redirect);

        return;
      }

      const page = template
        .replace("<!--ssr-outlet-->", result.html)
        .replace("<!--ssr-state-->", result.serializedData);

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
