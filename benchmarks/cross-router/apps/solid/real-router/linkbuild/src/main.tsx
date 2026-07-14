// real-router link-build variant — mount 1000 <Link>s on demand; the harness
// measures the ScriptDuration of that mount (= 1000 href builds + Link renders).
// Isolates reverse-matching (buildPath) cost from route construction (done once).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { Link, RouterProvider } from "@real-router/solid";
import { createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";

import type { Route } from "@real-router/core";
import type { JSX } from "solid-js";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;
const items: number[] = Array.from({ length: COUNT }, (_, i) => i);

const routes: Route[] = [
  { name: "home", path: "/" },
  ...items.map((i) => ({ name: `r${i}`, path: `/r${i}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

await router.start();

function App(): JSX.Element {
  const [show, setShow] = createSignal(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show() ? "shown" : "idle"}</main>
      <Show when={show()}>
        <nav>
          <For each={items}>
            {(i) => (
              <Link
                routeName={`r${i}`}
                data-testid={i === COUNT - 1 ? "last-link" : undefined}
              >
                r{i}
              </Link>
            )}
          </For>
        </nav>
      </Show>
    </>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  render(
    () => (
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    ),
    rootElement,
  );
}
