// SSG-only SSR server — `outputMode: "server"` requires `ssr.entry` to exist,
// even when the build target ships static files. ssg-build.ts spins this
// server up in-process during build to capture rendered HTML per URL, then
// exits. Not used at runtime — sirv serves the pre-rendered static output.
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";

export const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable("x-powered-by");

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

export const reqHandler = createNodeRequestHandler(app);
