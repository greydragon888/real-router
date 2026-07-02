// FEATURE DEMO — blocking guard (react-router v8 Data mode). `useBlocker`
// blocks leaving while dirty; Save clears the flag (+ resets a held block) and
// navigation is allowed.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useBlocker,
} from "react-router";

import type { JSX } from "react";

function Editor(): JSX.Element {
  const [dirty, setDirty] = useState(true);
  const blocker = useBlocker(() => dirty);

  return (
    <main data-testid="page-editor">
      <h1>Editor</h1>
      <button
        data-testid="btn-save"
        onClick={() => {
          setDirty(false);
          if (blocker.state === "blocked") blocker.reset();
        }}
      >
        Save
      </button>
      <Link to="/" data-testid="link-home">
        Home
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: () => <Outlet />,
    children: [
      { index: true, Component: () => <main data-testid="page-home">Home</main> },
      { path: "editor", Component: Editor },
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
