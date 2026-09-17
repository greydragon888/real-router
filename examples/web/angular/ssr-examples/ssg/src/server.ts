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

app.use((request, nodeResponse, next) => {
  angularApp
    .handle(request)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, nodeResponse) : next(),
    )
    .catch(next);
});

export const requestHandler = createNodeRequestHandler(app);
