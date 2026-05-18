// Node.js entry point for the Angular SSR mixed-mode example.
//
// Imports the Express `app` from the compiled server bundle and starts a
// listener if one is not already running. See ../ssr/server-runner.mjs for
// the rationale on this wrapper instead of `node server.mjs`.
import { app } from "./dist/ssr-mixed-angular-example/server/server.mjs";

const port = Number(process.env.PORT) || 4173;

if (!app.listening) {
  app.listen(port, () => {
    console.log(`Angular SSR (mixed mode): http://localhost:${port}`);
  });
}
