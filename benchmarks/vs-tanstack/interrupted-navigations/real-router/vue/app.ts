import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

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

const FastPage = defineComponent({
  setup() {
    const { route } = useRouteNode("fast");

    return () => {
      const id = String(route.value?.params.id ?? "");

      return h(
        "main",
        { "data-bench-page": "fast", "data-bench-id": id },
        `fast:${id}`,
      );
    };
  },
});

function App(appRouter: Router) {
  return defineComponent({
    setup() {
      return () =>
        h(
          RouterProvider,
          { router: appRouter },
          {
            default: () =>
              h(
                RouteView,
                { nodeName: "" },
                {
                  default: () => [
                    h(
                      RouteView.Match,
                      { segment: "shell" },
                      {
                        default: () =>
                          h("main", { "data-bench-page": "shell" }, "shell"),
                      },
                    ),
                    h(
                      RouteView.Match,
                      { segment: "fast" },
                      { default: () => h(FastPage) },
                    ),
                    h(
                      RouteView.Match,
                      { segment: "slow" },
                      {
                        default: () =>
                          h("main", { "data-bench-page": "slow" }, "slow"),
                      },
                    ),
                  ],
                },
              ),
          },
        );
    },
  });
}

export async function mountTestApp(container: HTMLElement, startPath = "/") {
  const router = createRouter(routes, {
    defaultRoute: "shell",
    limits: { maxListeners: 0, warnListeners: 0 },
  });

  await router.start(startPath);

  const app = createApp(App(router));

  app.mount(container);

  return {
    router,
    unmount() {
      app.unmount();
      router.stop();
    },
  };
}
