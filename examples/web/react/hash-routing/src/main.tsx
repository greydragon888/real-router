import { createRouter } from "@real-router/core";
import { hashPluginFactory } from "@real-router/hash-plugin";
import { RouterProvider } from "@real-router/react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { routes } from "./routes";

import "../../../../shared/styles.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
  // #1303 dogfood: hash routing is exactly the niche for opt-in case-insensitive
  // matching — the server never sees `#!/Home`, so the client router is the only
  // place that can normalize case. With this, `#!/Home` / `#!/HOME` resolve to the
  // lower-case `home` route (exact-case URLs still match; param values keep case).
  caseSensitive: false,
});

router.usePlugin(hashPluginFactory({ hashPrefix: "!" }));

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
