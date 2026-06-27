import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { RouterProvider, RouteView, useRouteNode } from "@real-router/react";
import { createRoot } from "react-dom/client";

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

function PagePage() {
  const { route } = useRouteNode("page");
  const id = String(route?.params.id ?? "");
  const data = route?.context?.data as unknown[] | undefined;

  return (
    <main data-bench-page="page" data-bench-id={id}>
      {`page:${id}:${data?.length ?? 0}`}
    </main>
  );
}

function App({ appRouter }: { appRouter: Router }) {
  return (
    <RouterProvider router={appRouter}>
      <RouteView nodeName="">
        <RouteView.Match segment="shell">
          <main data-bench-page="shell">shell</main>
        </RouteView.Match>
        <RouteView.Match segment="page">
          <PagePage />
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

  router.usePlugin(dataPlugin);

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
