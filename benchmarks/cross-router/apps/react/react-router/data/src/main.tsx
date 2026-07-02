// FEATURE DEMO — data on navigation (react-router v8 Data mode). Route `loader`
// resolves before the component renders; `useLoaderData()` reads it.
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLoaderData,
} from "react-router";

import type { JSX } from "react";

function Layout(): JSX.Element {
  return (
    <>
      <nav>
        <Link to="/data" data-testid="link-data">
          Data
        </Link>
      </nav>
      <Outlet />
    </>
  );
}

function DataPage(): JSX.Element {
  const loaded = useLoaderData() as { value: string };
  return <main data-testid="loaded-value">{loaded.value}</main>;
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: () => <main data-testid="page-home">Home</main> },
      {
        path: "data",
        loader: async () => ({ value: "loaded-42" }),
        Component: DataPage,
      },
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
