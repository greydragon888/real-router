import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/react";
import { createRoot } from "react-dom/client";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "items", path: "/items/:id?q" }];

function ItemPage() {
  const { route } = useRouteNode("items");
  const id = String(route?.params.id ?? "");
  const q = String(route?.params.q ?? "");

  return <main data-bench-id={id}>{`${id}:${q}`}</main>;
}

function App({ appRouter }: { appRouter: Router }) {
  return (
    <RouterProvider router={appRouter}>
      <RouteView nodeName="">
        <RouteView.Match segment="items">
          <ItemPage />
        </RouteView.Match>
      </RouteView>
    </RouterProvider>
  );
}

export async function mountTestApp(
  container: HTMLElement,
  startPath = "/items/0",
) {
  const router = createRouter(routes, {
    defaultRoute: "items",
    limits: { maxListeners: 0, warnListeners: 0 },
  });

  await router.start(startPath);

  const reactRoot = createRoot(container);

  reactRoot.render(<App appRouter={router} />);

  return {
    router,
    unmount() {
      reactRoot.unmount();
      router.stop();
    },
  };
}
