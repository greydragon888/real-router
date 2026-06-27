import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/solid-router";
import { render } from "solid-js/web";

const rootRoute = createRootRoute({
  component: () => <div>hello world</div>,
});

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute,
});

render(
  () => <RouterProvider router={router} />,
  document.querySelector("#root")!,
);
