import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { expressToFetchRequest, streamResponseToExpress } from "./_helpers";
import { getCachePolicy } from "../src/router/cache-policies";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// For /__rsc?route=/:path requests, the CACHE policy follows the
// underlying route, not the /__rsc URL itself. This helper extracts
// the route param so getCachePolicy() resolves the right rule.
function effectivePathForCache(originalUrl: string): string {
  const u = new URL(originalUrl, "http://localhost");

  if (u.pathname === "/__rsc") {
    return u.searchParams.get("route") ?? "/";
  }

  return originalUrl;
}

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  app.use(express.static(path.resolve(root, "dist/client"), { index: false }));

  const rscModule = (await import(path.resolve(root, "dist/rsc/index.js"))) as {
    default: { fetch: (request: Request) => Promise<Response> };
  };

  app.all(/.*/, async (request_, expressResponse, next) => {
    // AbortController per request — fired on client disconnect.
    // Propagated into the Web Request via expressToFetchRequest so
    // the RSC handler (and any loader reading getDep("abortSignal"))
    // can observe disconnects and stop work.
    const abortController = new AbortController();
    request_.on("close", () => {
      if (!expressResponse.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const request = expressToFetchRequest(request_, abortController.signal);
      const response = await rscModule.default.fetch(request);

      // Per-route Cache-Control on top of whatever the RSC handler
      // already set. Note: ETag is intentionally absent — both HTML
      // and Flight responses are streamed; buffering for hashing
      // would defeat streaming. See cache-policies.ts header.
      const cacheControl = getCachePolicy(
        effectivePathForCache(request_.originalUrl),
      );

      if (cacheControl && !response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", cacheControl);
      }

      await streamResponseToExpress(response, expressResponse);
    } catch (error) {
      // AbortError from a cancelled signal is expected on client
      // disconnect — log+swallow rather than letting Express's
      // default error handler emit "Cannot set headers after sent"
      // noise.
      if ((error as { name?: string } | null)?.name === "AbortError") {
        return;
      }

      next(error);
    }
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars -- PORT is conventional Express override, not turbo task input
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[prod] http://localhost:${port}`);
  });
}

void startServer();
