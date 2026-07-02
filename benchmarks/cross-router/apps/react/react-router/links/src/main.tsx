// react-router links variant — 100 <NavLink> (built-in active-aware) to sibling
// /tab/i routes; className callback recomputes on every navigation.
import { createRoot } from "react-dom/client";
import { NavLink, Outlet, RouterProvider, createBrowserRouter } from "react-router";

import { tabs } from "../../../_shared/links-spec";

import type { JSX } from "react";

function TabPage({ n }: { n: string }): JSX.Element {
  return (
    <main data-testid="page-tab" data-n={n}>
      <h1>Tab {n}</h1>
    </main>
  );
}

function Layout(): JSX.Element {
  return (
    <>
      <nav>
        {tabs.map((i) => (
          <NavLink
            key={i}
            to={`/tab/${i}`}
            className={({ isActive }) => (isActive ? "active" : "")}
            data-testid={`link-tab-${i}`}
          >
            Tab {i}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        Component: () => (
          <main data-testid="page-home">
            <h1>Home</h1>
          </main>
        ),
      },
      ...tabs.map((i) => ({
        path: `tab/${i}`,
        Component: () => <TabPage n={String(i)} />,
      })),
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
