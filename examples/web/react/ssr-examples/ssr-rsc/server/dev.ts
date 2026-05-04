import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import {
  createServer as createViteServer,
  createServerModuleRunner,
} from "vite";

import { expressToFetchRequest, streamResponseToExpress } from "./_helpers";
import { getCachePolicy } from "../src/router/cache-policies";

function effectivePathForCache(originalUrl: string): string {
  const u = new URL(originalUrl, "http://localhost");

  if (u.pathname === "/__rsc") {
    return u.searchParams.get("route") ?? "/";
  }

  return originalUrl;
}

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

  const rscRunner = createServerModuleRunner(vite.environments.rsc);

  app.all(/.*/, async (request_, expressResponse, next) => {
    const abortController = new AbortController();
    request_.on("close", () => {
      if (!expressResponse.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const rscModule =
        await rscRunner.import<typeof import("../src/entry.rsc")>(
          "/src/entry.rsc.tsx",
        );

      const request = expressToFetchRequest(request_, abortController.signal);
      const response = await rscModule.default.fetch(request);

      const cacheControl = getCachePolicy(
        effectivePathForCache(request_.originalUrl),
      );

      if (cacheControl && !response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", cacheControl);
      }

      await streamResponseToExpress(response, expressResponse);
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") {
        return;
      }

      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars -- PORT is conventional Express override, not turbo task input
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[dev] http://localhost:${port}`);
  });
}

void startDevServer();
