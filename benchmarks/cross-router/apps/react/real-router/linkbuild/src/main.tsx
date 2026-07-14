// real-router link-build variant — mount 1000 <Link>s on demand; the harness
// measures the ScriptDuration of that mount (= 1000 href builds + Link renders).
// Isolates reverse-matching (buildPath) cost from route construction (done once).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider } from "@real-router/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { Route } from "@real-router/core";
import type { JSX } from "react";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

const routes: Route[] = [
  { name: "home", path: "/" },
  ...Array.from({ length: COUNT }, (_, i) => ({ name: `r${i}`, path: `/r${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function App(): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show ? "shown" : "idle"}</main>
      {show && (
        <nav>
          {Array.from({ length: COUNT }, (_, i) => (
            <Link
              key={i}
              routeName={`r${i}`}
              data-testid={i === COUNT - 1 ? "last-link" : undefined}
            >
              r{i}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(
    <RouterProvider router={router}>
      <App />
    </RouterProvider>,
  );
}
