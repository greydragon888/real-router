// Census-completeness probe: the census's `thenable-returns` family lists
// GuardFn / LeaveFn / start-interceptor returns only. `EventEmitter#invokeIsolated`
// reads `.then` on EVERY listener's return and, when it is a function, hands the
// object to `Promise.resolve` — so the returns of the 7 Plugin hooks,
// `addEventListener` callbacks, `subscribe` listeners and `subscribeChanges`
// handlers are consumed too. Count `then` reads and `then` calls per site.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

const counters: Record<string, { thenReads: number; thenCalls: number }> = {};
const thenable = (site: string) => {
  counters[site] = { thenReads: 0, thenCalls: 0 };

  return {
    get then() {
      counters[site].thenReads++;

      return (resolve: (v: unknown) => void) => {
        counters[site].thenCalls++;
        resolve(undefined);
      };
    },
  };
};

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const api = getPluginApi(router);
  const routesApi = getRoutesApi(router);

  router.usePlugin(() => ({
    onStart: () => thenable("Plugin.onStart·return"),
    onTransitionStart: () => thenable("Plugin.onTransitionStart·return"),
    onTransitionLeaveApprove: () => thenable("Plugin.onTransitionLeaveApprove·return"),
    onTransitionSuccess: () => thenable("Plugin.onTransitionSuccess·return"),
  }));
  api.addEventListener("$$success", () => thenable("PluginApi.addEventListener·cb·return") as never);
  router.subscribe(() => thenable("Router.subscribe·SubscribeFn·return") as never);
  routesApi.subscribeChanges(() => thenable("RoutesApi.subscribeChanges·handler·return") as never);

  await router.start("/a");
  await router.navigate("b");
  routesApi.add({ name: "z", path: "/z" } as never);

  // let Promise.resolve(thenable) run its microtask
  await new Promise((r) => setTimeout(r, 10));

  // NEGATIVE CONTROL: a plain object return (no `then`) is left alone.
  const plain = { get then() { counters.plainControl.thenReads++; return 42; } };
  counters.plainControl = { thenReads: 0, thenCalls: 0 };
  router.subscribe(() => plain as never);
  await router.navigate("a");
  await new Promise((r) => setTimeout(r, 10));

  console.log(JSON.stringify(counters, null, 1));
}

void main();
