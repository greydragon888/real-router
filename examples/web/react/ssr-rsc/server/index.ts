import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expressToFetchRequest, streamResponseToExpress } from "./_helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function startServer(): Promise<void> {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    express.static(path.resolve(root, "dist/client"), { index: false }),
  );

  const rscModule = (await import(
    path.resolve(root, "dist/rsc/index.js")
  )) as { default: { fetch: (request: Request) => Promise<Response> } };

  app.all(/.*/, async (req, res, next) => {
    try {
      const request = expressToFetchRequest(req);
      const response = await rscModule.default.fetch(request);

      await streamResponseToExpress(response, res);
    } catch (error) {
      next(error);
    }
  });

  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`[prod] http://localhost:${port}`);
  });
}

void startServer();
