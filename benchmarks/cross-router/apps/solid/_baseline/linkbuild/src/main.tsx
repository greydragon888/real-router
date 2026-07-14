// _baseline linkbuild — 1000 plain <a>, NO router Link (the href is a literal
// string, no reverse-matcher). The FLOOR for link-build: raw <a> render cost.
import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";

import type { JSX } from "solid-js";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

function App(): JSX.Element {
  const [show, setShow] = createSignal(false);
  return (
    <>
      <button data-testid="mount-links" onClick={() => setShow(true)}>
        mount
      </button>
      <main data-testid="page-ready">{show() ? "shown" : "idle"}</main>
      {show() && (
        <nav>
          <For each={Array.from({ length: COUNT }, (_, i) => i)}>
            {(i) => (
              <a
                href={`/r${i}`}
                data-testid={i === COUNT - 1 ? "last-link" : undefined}
              >
                r{i}
              </a>
            )}
          </For>
        </nav>
      )}
    </>
  );
}

const root = document.querySelector("#root");
if (root) {
  render(() => <App />, root);
}
