// Census-completeness probe: the census lists `PluginFactory·router` as a
// hand-out of the Router instance to application code. The SAME hand-out is
// made by every guard factory (Route.canActivate / canDeactivate,
// LifecycleApi.addActivateGuard / addDeactivateGuard, RoutesApi.update
// canActivate) and by shared/ssr's loader factories — none has an id.
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const captured: Record<string, unknown> = {};

const routes = [
  {
    name: "a",
    path: "/a",
    canActivate: (r: unknown) => {
      captured["Route.canActivate·GuardFnFactory·router"] = r;

      return () => true;
    },
    canDeactivate: (r: unknown) => {
      captured["Route.canDeactivate·GuardFnFactory·router"] = r;

      return () => true;
    },
  },
  { name: "b", path: "/b" },
];

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);

  getLifecycleApi(router).addActivateGuard("b", ((r: unknown) => {
    captured["LifecycleApi.addActivateGuard·GuardFnFactory·router"] = r;

    return () => true;
  }) as never);
  getLifecycleApi(router).addDeactivateGuard("b", ((r: unknown) => {
    captured["LifecycleApi.addDeactivateGuard·GuardFnFactory·router"] = r;

    return () => true;
  }) as never);
  getRoutesApi(router).update("b", {
    canActivate: (r: unknown) => {
      captured["RoutesApi.update·updates.canActivate·GuardFnFactory·router"] = r;

      return () => true;
    },
  } as never);

  // CENSUSED control
  router.usePlugin(((r: unknown) => {
    captured["PluginFactory·router (censused control)"] = r;

    return {};
  }) as never);

  const ssrFactory = createSsrLoaderPlugin(
    {
      a: (r: unknown) => {
        captured["SsrLoaderFnFactory·router (shared/ssr compile)"] = r;

        return () => ({ ok: true });
      },
    } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  router.usePlugin(ssrFactory as never);

  await router.start("/a");

  const out = Object.fromEntries(
    Object.entries(captured).map(([k, v]) => [k, { isRouterInstance: v === router, arrived: v !== undefined }]),
  );

  console.log(JSON.stringify(out, null, 1));
}

void main();
