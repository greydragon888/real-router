// react-router v8 — Data mode only (createBrowserRouter + RouterProvider),
// imported from "react-router" (react-router-dom is folded in since v7).
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from "react-router";

import { NAV } from "../../_shared/nav-meta";
import { About, Home, User } from "../../_shared/pages";

import type { JSX } from "react";

function Layout(): JSX.Element {
  return (
    <>
      <nav>
        {NAV.map((n) => (
          <Link key={n.path} to={n.path} data-testid={n.testid}>
            {n.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

function UserRoute(): JSX.Element {
  const { id } = useParams();
  const next = String(Number(id) + 1);

  return (
    <>
      <User id={id ?? ""} />
      <Link to={`/users/${next}`} data-testid="link-user-next">
        Next
      </Link>
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "about", Component: About },
      { path: "users/:id", Component: UserRoute },
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
