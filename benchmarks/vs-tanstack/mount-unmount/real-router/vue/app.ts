import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "a", path: "/a" }];

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
                      { segment: "a" },
                      {
                        default: () =>
                          h("main", { "data-bench-page": "a" }, "A"),
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

export async function mountTestApp(container: HTMLElement, startPath = "/a") {
  const router = createRouter(routes, {
    defaultRoute: "a",
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
