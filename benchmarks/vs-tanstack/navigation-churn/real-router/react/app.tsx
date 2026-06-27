import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/react";
import { createRoot } from "react-dom/client";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

function App({ appRouter }: { appRouter: Router }) {
  return (
    <RouterProvider router={appRouter}>
      <RouteView nodeName="">
        <RouteView.Match segment="a">
          <div data-testid="page-a">A</div>
        </RouteView.Match>
        <RouteView.Match segment="b">
          <div data-testid="page-b">B</div>
        </RouteView.Match>
      </RouteView>
    </RouterProvider>
  );
}

export async function mountTestApp(container: HTMLElement, startPath = "/a") {
  const router = createRouter(routes, {
    defaultRoute: "a",
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
