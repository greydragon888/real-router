// @solidjs/router link-build variant — mount 1000 <A> links on demand (button).
// createSignal drives the toggle; only the 1000th link carries the "last-link"
// testid so the driver can wait for the whole batch to commit.
import { A, Router } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { render } from "solid-js/web";

import type { RouteDefinition } from "@solidjs/router";
import type { JSX } from "solid-js";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

function Home(): JSX.Element {
  const [show, setShow] = createSignal(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show() ? "shown" : "idle"}</main>
      <Show when={show()}>
        <nav>
          <For each={Array.from({ length: COUNT }, (_, i) => i)}>
            {(i) => (
              <A
                href={`/r${i}`}
                data-testid={i === COUNT - 1 ? "last-link" : undefined}
              >
                r{i}
              </A>
            )}
          </For>
        </nav>
      </Show>
    </>
  );
}

const routes: RouteDefinition[] = [
  { path: "/", component: Home },
  ...Array.from({ length: COUNT }, (_, i) => ({
    path: `/r${i}`,
    component: () => null,
  })),
];

const root = document.querySelector("#root");
if (root) {
  render(() => <Router>{routes}</Router>, root);
}
