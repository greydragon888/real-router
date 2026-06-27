import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/vue";
import { createApp, defineComponent, h } from "vue";

import type { Route, Router, PluginFactory, State } from "@real-router/core";

// real-router has no built-in CSR loader; the honest analogue of TanStack's
// "departed route loader data must not stay pinned" is per-route CONTEXT
// retention: a plugin writes a large payload into state.context.data via
// claimContextNamespace on each navigation. Detects that a left route's context
// payload is reclaimed (flat heap floor), not pinned across navigations.

const RECORD_COUNT = 200;

function createPayload(id: string) {
  return Array.from({ length: RECORD_COUNT }, (_, index) => ({
    id,
    index,
    value: `record-${id}-${index}`,
  }));
}

const dataPlugin: PluginFactory = (router) => {
  const claim = getPluginApi(router).claimContextNamespace("data");

  return {
    onTransitionSuccess(toState: State) {
      claim.write(toState, createPayload(String(toState.params.id ?? "")));
    },
    teardown() {
      claim.release();
    },
  };
};

const routes: Route[] = [
  { name: "shell", path: "/" },
  { name: "page", path: "/page/:id" },
];

const PagePage = defineComponent({
  setup() {
    const { route } = useRouteNode("page");

    return () => {
      const id = String(route.value?.params.id ?? "");
      const data = route.value?.context?.data as unknown[] | undefined;

      return h(
        "main",
        { "data-bench-page": "page", "data-bench-id": id },
        `page:${id}:${data?.length ?? 0}`,
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
                      { segment: "page" },
                      { default: () => h(PagePage) },
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

  router.usePlugin(dataPlugin);

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
