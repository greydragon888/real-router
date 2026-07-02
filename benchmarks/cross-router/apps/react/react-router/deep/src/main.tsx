// react-router v8 (Data mode) deep variant — nested children to depth 20. Each
// level is a layout (Outlet) with [index leaf, next level]. Root "/" has no
// Component → renders an implicit <Outlet/>.
import { createRoot } from "react-dom/client";
import { Link, Outlet, RouterProvider, createBrowserRouter } from "react-router";

import { CatalogItem } from "../../../_shared/pages";
import { DEEP_DEPTH, DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";

import type { RouteObject } from "react-router";
import type { JSX } from "react";

function LevelLayout(): JSX.Element {
  return (
    <div className="lvl">
      <Outlet />
    </div>
  );
}

function buildLevel(k: number): RouteObject {
  const children: RouteObject[] = [
    { index: true, Component: () => <CatalogItem n={String(k)} /> },
  ];
  if (k < DEEP_DEPTH) children.push(buildLevel(k + 1));
  return { path: `l${k}`, Component: LevelLayout, children };
}

function Home(): JSX.Element {
  return (
    <nav>
      {DEEP_TARGETS.map((d) => (
        <Link key={d} to={deepPath(d)} data-testid={`link-deep-${d}`}>
          Depth {d}
        </Link>
      ))}
    </nav>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    children: [
      { index: true, Component: Home },
      { path: "deep", Component: LevelLayout, children: [buildLevel(1)] },
    ],
  },
]);

const rootElement = document.querySelector("#root");

if (rootElement) {
  createRoot(rootElement).render(<RouterProvider router={router} />);
}
