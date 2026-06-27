import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "a", path: "/a" }];

function App(props: { appRouter: Router }) {
  return (
    <RouterProvider router={props.appRouter}>
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

  const dispose = render(() => <App appRouter={router} />, container);

  return {
    router,
    unmount() {
      dispose();
      router.stop();
    },
  };
}
