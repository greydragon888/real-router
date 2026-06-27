import { createRouter } from "@real-router/core";
import { RouterProvider, RouteView } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route } from "@real-router/core";

const routes: Route[] = [{ name: "home", path: "/" }];

const router = createRouter(routes, { defaultRoute: "home" });

const App = defineComponent({
  setup() {
    return () =>
      h(
        RouterProvider,
        { router },
        {
          default: () =>
            h(
              RouteView,
              { nodeName: "" },
              {
                default: () => [
                  h(
                    RouteView.Match,
                    { segment: "home" },
                    { default: () => h("div", "hello world") },
                  ),
                ],
              },
            ),
        },
      );
  },
});

async function main() {
  await router.start("/");

  createApp(App).mount("#root");
}

void main();
