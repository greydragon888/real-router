import express from "express";
import { createServer as createViteServer, createServerModuleRunner } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expressToFetchRequest, streamResponseToExpress } from "./_helpers";

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

  app.all(/.*/, async (req, res, next) => {
    try {
      const rscModule = (await rscRunner.import("/src/entry.rsc.tsx")) as {
        default: { fetch: (request: Request) => Promise<Response> };
      };

      const request = expressToFetchRequest(req);
      const response = await rscModule.default.fetch(request);

      await streamResponseToExpress(response, res);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[dev] http://localhost:${port}`);
  });
}

void startDevServer();
