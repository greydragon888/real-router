// _baseline linkbuild — 1000 plain <a>, NO router Link (the href is a literal
// string, no reverse-matcher). The FLOOR for link-build: raw <a> render cost.
import { useState } from "react";
import { createRoot } from "react-dom/client";

import type { JSX } from "react";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

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
            <a
              key={i}
              href={`/r${i}`}
              data-testid={i === COUNT - 1 ? "last-link" : undefined}
            >
              r{i}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
