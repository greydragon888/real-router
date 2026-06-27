import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootRoute = createRootRoute({
  component: () => <div>hello world</div>,
});

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute,
});

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
