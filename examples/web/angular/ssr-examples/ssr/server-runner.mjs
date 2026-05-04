// Node.js entry point for Angular SSR examples.
//
// `outputMode: "server"` produces server.mjs intended primarily for serverless
// runtimes (Vercel Edge, Cloudflare Workers). The `isMainModule` check there
// SHOULD start a listener when invoked directly via `node server.mjs`, but
// that path is fragile across @angular/ssr versions. This wrapper is a stable
// local-execution entry: it imports `app` from the compiled server bundle and
// starts a listener iff one is not already running.
import { app } from "./dist/ssr-angular-example/server/server.mjs";

const port = Number(process.env.PORT) || 4173;

if (!app.listening) {
  app.listen(port, () => {
    console.log(`Angular SSR server: http://localhost:${port}`);
  });
}
