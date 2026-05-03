import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { expressToFetchRequest, streamResponseToExpress } from "./_helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  app.use(express.static(path.resolve(root, "dist/client"), { index: false }));

  const rscModule = (await import(path.resolve(root, "dist/rsc/index.js"))) as {
    default: { fetch: (request: Request) => Promise<Response> };
  };

  app.all(/.*/, async (request_, expressResponse, next) => {
    try {
      const request = expressToFetchRequest(request_);
      const response = await rscModule.default.fetch(request);

      await streamResponseToExpress(response, expressResponse);
    } catch (error) {
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
