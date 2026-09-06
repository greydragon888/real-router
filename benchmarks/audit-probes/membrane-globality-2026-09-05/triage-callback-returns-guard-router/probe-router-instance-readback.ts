// Triage probe (batch: thenable-returns + GuardFnFactory·router).
// Question: is the Router instance handed to application-written factories
// (route canActivate/canDeactivate, LifecycleApi.add*Guard, RoutesApi.update
// guards) READ BACK by core through a property the application may shadow?
// Candidate symbol, from a census of `router.` reads across packages/core/src:
// getRoutesApi.ts · replace (`const currentState = router.getState()`).
import { createRouter } from "@real-router/core";
import {
  getRoutesApi,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core/api";

const out: Record<string, unknown> = {};

async function main(): Promise<void> {
  const routes = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];
  const router = createRouter(routes as never, {} as never);

  await router.start("/a");

  // The very object core hands to an application guard factory:
  let handed: unknown;

  getLifecycleApi(router).addActivateGuard("b", ((r: unknown) => {
    handed = r;

    return () => true;
  }) as never);
  out.handedIsRouterInstance = handed === router;

  // POSITIVE CONTROL that the read site is reached at all: count calls of the
  // real getState during `replace` by installing an OWN property that delegates.
  const proto = Object.getPrototypeOf(router) as { getState: () => unknown };
  const realGetState = proto.getState;
  let reads = 0;

  Object.defineProperty(router, "getState", {
    configurable: true,
    writable: true,
    value: function shadowed(this: unknown): unknown {
      reads++;

      return realGetState.call(this);
    },
  });

  getRoutesApi(router).replace([
    { name: "a", path: "/a" },
    { name: "c", path: "/c" },
  ] as never);
  out.shadowedGetStateReadsDuringReplace = reads;

  // Does the shadow CHANGE core's behaviour (a lie, not just a count)? Core uses
  // `currentState` to decide whether the current route survived the swap.
  Object.defineProperty(router, "getState", {
    configurable: true,
    writable: true,
    value: () => ({
      name: "ghost",
      params: {},
      search: {},
      path: "/ghost",
      meta: undefined,
    }),
  });

  let lying = "no-observable-change";

  try {
    getRoutesApi(router).replace([
      { name: "a", path: "/a" },
      { name: "d", path: "/d" },
    ] as never);
    lying = `completed; realState.name=${String(realGetState.call(router)?.name)}`;
  } catch (error) {
    lying = `threw:${(error as Error).message}`;
  }
  out.lyingGetStateEffect = lying;

  Reflect.deleteProperty(router, "getState");

  // NEGATIVE CONTROL: the re-entry doors consume the handle BY IDENTITY —
  // a Proxy around the very same instance is rejected.
  try {
    getPluginApi(new Proxy(router, {}) as never);
    out.proxyRejectedByReentryDoor = false;
  } catch (error) {
    out.proxyRejectedByReentryDoor = `threw:${(error as Error).message}`;
  }

  // CONTROL ARM for `lyingGetStateEffect`: the same replace, same shapes, with
  // the shadow REMOVED — proves the state change above came from the lie.
  const control = createRouter(routes as never, {} as never);

  await control.start("/a");
  getRoutesApi(control).replace([
    { name: "a", path: "/a" },
    { name: "c", path: "/c" },
  ] as never);
  getRoutesApi(control).replace([
    { name: "a", path: "/a" },
    { name: "d", path: "/d" },
  ] as never);
  out.controlNoShadowStateName = control.getState()?.name;

  console.log(JSON.stringify(out, null, 1));
}

void main();
