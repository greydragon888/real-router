// Node.js entry point for Angular SSR examples.
//
// Same wrapper pattern as ssr/ — see ssr/server-runner.mjs for rationale.
import { app } from "./dist/ssr-streaming-angular-example/server/server.mjs";

const port = Number(process.env.PORT) || 4173;

if (!app.listening) {
  app.listen(port, () => {
    console.log(`Angular SSR streaming server: http://localhost:${port}`);
  });
}
