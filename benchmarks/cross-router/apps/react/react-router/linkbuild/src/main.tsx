// react-router v8 link-build variant — mount 1000 <Link>s on demand.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, RouterProvider, createBrowserRouter } from "react-router";

import type { JSX } from "react";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;

function Home(): JSX.Element {
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
              to={`/r${i}`}
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

const router = createBrowserRouter([
  { path: "/", Component: Home },
  ...Array.from({ length: COUNT }, (_, i) => ({
    path: `r${i}`,
    Component: () => null,
  })),
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
