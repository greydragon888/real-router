import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/solid";
import { render } from "solid-js/web";

import type { Route, Router } from "@real-router/core";

// Per-id deferred for the slow route's canActivate — the real-router analogue of
// TanStack's hanging slow loader. Module-level so setup.ts can drive it.
const slowDeferreds = new Map<string, () => void>();

export const slowLoaderControls = {
  has: (id: string) => slowDeferreds.has(id),
  resolve(id: string) {
    slowDeferreds.get(id)?.();
  },
  resolveAll() {
    for (const resolve of slowDeferreds.values()) {
      resolve();
    }
  },
};

const routes: Route[] = [
  { name: "shell", path: "/" },
  { name: "fast", path: "/fast/:id" },
  {
    name: "slow",
    path: "/slow/:id",
    // Hangs until setup resolves it; a fast navigation cancels the pending
    // navigation first (core AbortController), so this resolve usually lands
    // after the slow navigation already rejected with TRANSITION_CANCELLED.
    canActivate: () => (toState) => {
      const id = String(toState.params.id);

      return new Promise<boolean>((resolve) => {
        slowDeferreds.set(id, () => {
          slowDeferreds.delete(id);
          resolve(true);
        });
      });
    },
  },
];

function FastPage() {
  const routeState = useRouteNode("fast");
  const id = () => String(routeState().route?.params.id ?? "");

  return (
    <main data-bench-page="fast" data-bench-id={id()}>{`fast:${id()}`}</main>
  );
}

function App(props: { appRouter: Router }) {
  return (
    <RouterProvider router={props.appRouter}>
      <RouteView nodeName="">
        <RouteView.Match segment="shell">
          <main data-bench-page="shell">shell</main>
        </RouteView.Match>
        <RouteView.Match segment="fast">
          <FastPage />
        </RouteView.Match>
        <RouteView.Match segment="slow">
          <main data-bench-page="slow">slow</main>
        </RouteView.Match>
      </RouteView>
    </RouterProvider>
  );
}

export async function mountTestApp(container: HTMLElement, startPath = "/") {
  const router = createRouter(routes, {
    defaultRoute: "shell",
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
