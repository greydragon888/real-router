import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

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

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;
    const isAuthenticated = request.headers.cookie?.includes("auth=1") ?? false;

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
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Production server: http://localhost:${port}`);
  });
}

void startServer();
