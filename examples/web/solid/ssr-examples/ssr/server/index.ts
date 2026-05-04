import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { getCurrentUserFromCookies } from "./_auth";

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
    render: (
      url: string,
      ctx: {
        currentUser: {
          id: string;
          name: string;
          role: "admin" | "user";
        } | null;
      },
    ) => Promise<RenderResult>;
  };

  app.get("/{*path}", async (request, response) => {
    const url = request.originalUrl;
    const currentUser = getCurrentUserFromCookies(request.headers.cookie);

    const result = await module_.render(url, { currentUser });

    if (result.redirect) {
      response.redirect(result.statusCode, result.redirect);

      return;
    }

    if (result.rawBody !== undefined) {
      response
        .status(result.statusCode)
        .set("Content-Type", result.contentType ?? "text/plain; charset=utf-8")
        .send(result.rawBody);

      return;
    }

    const page = template
      .replace("<!--ssr-head-->", result.head)
      .replace("<!--ssr-hydration-script-->", result.hydrationScript)
      .replace("<!--ssr-outlet-->", result.html)
      .replace("<!--ssr-state-->", result.serializedData);

    response
      .status(result.statusCode)
      .set("Content-Type", "text/html")
      .send(page);
  });

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Production server: http://localhost:${port}`);
  });
}

void startServer();
