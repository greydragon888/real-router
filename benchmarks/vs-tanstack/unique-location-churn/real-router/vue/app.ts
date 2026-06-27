import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route, Router } from "@real-router/core";

const routes: Route[] = [{ name: "items", path: "/items/:id?q" }];

const ItemPage = defineComponent({
  setup() {
    const { route } = useRouteNode("items");

    return () => {
      const id = String(route.value?.params.id ?? "");
      const q = String(route.value?.params.q ?? "");

      return h("main", { "data-bench-id": id }, `${id}:${q}`);
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
                      { segment: "items" },
                      { default: () => h(ItemPage) },
                    ),
                  ],
                },
              ),
          },
        );
    },
  });
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
