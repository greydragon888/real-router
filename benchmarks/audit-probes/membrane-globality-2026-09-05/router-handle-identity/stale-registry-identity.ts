// The same handle as an identity key OUTSIDE core: `shared/ssr/staleRegistry.ts ·
// staleByRouter` (WeakMap<Router, Set<string>>), fed by `invalidate(router, ns)` of the
// ssr-data / rsc-server plugins and consumed by `createSsrLoaderPlugin`'s subscribeLeave
// handler with the handle CORE handed the plugin factory. Question: is a copy of the
// handle (a pass-through Proxy — what a reactive store makes) a different key, and what
// does that do to the documented behaviour (the next navigation re-runs the loader)?
import { createRouter } from "@real-router/core";
import { invalidate, ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import { isStale } from "../../../../shared/ssr/staleRegistry";

function countingProxy<T extends object>(target: T): {
  proxy: T;
  reads: Record<string, number>;
} {
  const reads: Record<string, number> = {};
  const proxy = new Proxy(target, {
    get(t, key, receiver): unknown {
      reads[String(key)] = (reads[String(key)] ?? 0) + 1;

      return Reflect.get(t, key, receiver);
    },
  });

  return { proxy, reads };
}

async function main(): Promise<void> {
  let loads = 0;
  const router = createRouter([
    { name: "a", path: "/a" },
    { name: "home", path: "/home" },
  ] as never);

  router.usePlugin(
    ssrDataPluginFactory({
      home: () => () => {
        loads += 1;

        return { loads };
      },
    }) as never,
  );

  await router.start("/a");
  const loadsAfterStartAtA = loads;

  // Arm 1 — the REAL handle: documented behaviour (positive control).
  invalidate(router, "data");
  const moduleIdentity = {
    "isStale (imported via shared/ssr path) sees invalidate (imported via plugin) — single module instance":
      isStale(router, "data"),
  };
  const s1 = await router.navigate("home");
  const arm1 = {
    "loader ran on the navigation after invalidate(router)": loads - loadsAfterStartAtA,
    "state.context.data written": s1.context.data,
    "flag consumed": isStale(router, "data"),
  };

  await router.navigate("a");

  // Arm 2 — a pass-through Proxy of the same router: the flag lands on ANOTHER key.
  const { proxy, reads } = countingProxy(router);

  invalidate(proxy as never, "data");
  const flagOnProxy = isStale(proxy as never, "data");
  const flagOnReal = isStale(router, "data");
  const loadsBefore = loads;
  const s2 = await router.navigate("home");
  const arm2 = {
    "reads on the proxy during invalidate(proxy) (WeakMap key only)": reads,
    "flag registered under the proxy identity": flagOnProxy,
    "flag visible under the real identity the plugin consumes": flagOnReal,
    "loader ran on the navigation after invalidate(proxy)": loads - loadsBefore,
    "state.context.data on that navigation": s2.context.data ?? "(absent)",
    "flag still parked under the proxy after the navigation (never consumed)": isStale(
      proxy as never,
      "data",
    ),
  };

  console.log(JSON.stringify({ loadsAfterStartAtA, moduleIdentity, arm1, arm2 }, null, 2));
  router.dispose();
}

void main();
