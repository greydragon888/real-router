// react-router v8 (Data mode) table-heap variant — N flat routes (?n=N).
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";

import type { JSX } from "react";

const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

function Ready(): JSX.Element {
  return (
    <main data-testid="page-ready" data-n={String(n)}>
      ready
    </main>
  );
}

const router = createBrowserRouter([
  { path: "/", Component: Ready },
  ...Array.from({ length: n }, (_, i) => ({ path: `r${i}`, Component: Ready })),
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
