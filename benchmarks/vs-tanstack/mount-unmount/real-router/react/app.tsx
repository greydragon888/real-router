import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/react";
import { createRoot } from "react-dom/client";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "a", path: "/a" }];

function App({ appRouter }: { appRouter: Router }) {
  return (
    <RouterProvider router={appRouter}>
      <RouteView nodeName="">
        <RouteView.Match segment="a">
          <main data-bench-page="a">A</main>
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
