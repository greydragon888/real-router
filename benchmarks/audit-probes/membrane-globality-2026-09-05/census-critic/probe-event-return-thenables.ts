// Census-critic probe 7: the RETURN of the two remaining listener kinds that
// go through EventEmitter · #invokeIsolated — `RoutesApi.subscribeChanges·
// handler` and `PluginApi.addEventListener·cb` — is `.then` read on what the
// application returns? (Plugin hooks and SubscribeFn: proven in probe 5f.)
//
// Positive control: a plain `undefined` return reads nothing and the emit
// completes (the counting object is only consulted when returned).
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-event-return-thenables.ts
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

function thenableCounter(): { obj: object; reads: () => number } {
  let reads = 0;
  const obj = {};

  Object.defineProperty(obj, "then", {
    get(): unknown {
      reads++;

      return (res: (v: unknown) => void): void => {
        res(undefined);
      };
    },
  });

  return { obj, reads: (): number => reads };
}

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "z", path: "/z" },
    ] as never,
    {} as never,
  );
  const routesApi = getRoutesApi(router);
  const api = getPluginApi(router);

  const tree = thenableCounter();
  const ev = thenableCounter();
  let treeHandlerCalls = 0;
  let evCbCalls = 0;

  routesApi.subscribeChanges((): unknown => {
    treeHandlerCalls++;

    return tree.obj;
  });
  api.addEventListener("$$success", ((): unknown => {
    evCbCalls++;

    return ev.obj;
  }) as never);

  routesApi.add({ name: "n", path: "/n" } as never);
  await router.start("/home");
  await router.navigate("z");
  await new Promise((resolve) => setTimeout(resolve, 0));

  console.log(
    JSON.stringify(
      {
        "RoutesApi.subscribeChanges·handler·return": {
          handlerCalls: treeHandlerCalls,
          thenReads: tree.reads(),
        },
        "PluginApi.addEventListener·cb·return": {
          cbCalls: evCbCalls,
          thenReads: ev.reads(),
        },
      },
      null,
      2,
    ),
  );
}

void main();
