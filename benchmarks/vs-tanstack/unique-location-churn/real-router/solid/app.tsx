import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "items", path: "/items/:id?q" }];

function ItemPage() {
  const routeState = useRouteNode("items");
  const id = () => String(routeState().route?.params.id ?? "");
  const q = () => String(routeState().route?.params.q ?? "");

  return <main data-bench-id={id()}>{`${id()}:${q()}`}</main>;
}

function App(props: { appRouter: Router }) {
  return (
    <RouterProvider router={props.appRouter}>
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

  const dispose = render(() => <App appRouter={router} />, container);

  return {
    router,
    unmount() {
      dispose();
      router.stop();
    },
  };
}
