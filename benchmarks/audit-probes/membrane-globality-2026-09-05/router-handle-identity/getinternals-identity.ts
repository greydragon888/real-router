// Family: the router HANDLE as an identity key (WeakMap). Doors: getInternals·router and
// every entry point that reaches it — getPluginApi / getRoutesApi / getDependenciesApi /
// getLifecycleApi / cloneRouter. getNavigator·router (already censused) is the control.
//
// Questions, each answered by execution:
//  Q1  how many slots of the caller's handle are READ before the identity lookup decides
//      (a pass-through Proxy counts; expected 0 — the WeakMap takes the object as a key);
//  Q2  does a structurally VALID copy of the handle pass — spread copy carries the bound
//      methods and works as a router, Object.create inherits everything, a pass-through
//      Proxy is what a reactive store makes. If every copy is refused while the copy
//      itself works as a router, strategy (a) "copy the container at the boundary" is
//      impossible by construction → the door is MUST-(b), not by opinion but by outcome;
//  Q3  is the per-router cache keyed by identity (same api object for the same handle,
//      a different one for a copy);
//  Q4  which doors HOLD the handle and read it by name in a LATER frame — accessor
//      counters installed on the real instance's own keys (the instance is not frozen,
//      which extendRouter itself relies on), read during api construction and during
//      replace() / extendRouter().
import { createRouter, getNavigator } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Entry = readonly [name: string, call: (r: unknown) => unknown];

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
    has(t, key): boolean {
      reads[`has:${String(key)}`] = (reads[`has:${String(key)}`] ?? 0) + 1;

      return Reflect.has(t, key);
    },
  });

  return { proxy, reads };
}

function outcome(fn: () => unknown): string {
  try {
    const v = fn();

    return `ok:${typeof v}`;
  } catch (error) {
    const e = error as { name?: string; code?: string; message?: string };

    return `threw:${e.name ?? "?"}${e.code ? `[${e.code}]` : ""}:${(e.message ?? "").slice(0, 60)}`;
  }
}

/** Accessor counters on every OWN key of the real instance (bound methods live there). */
function instrumentOwnKeys(router: object): Record<string, number> {
  const reads: Record<string, number> = {};

  for (const key of Object.keys(router)) {
    const value = (router as Record<string, unknown>)[key];

    Object.defineProperty(router, key, {
      configurable: true,
      enumerable: true,
      get(): unknown {
        reads[key] = (reads[key] ?? 0) + 1;

        return value;
      },
      set(next: unknown): void {
        Object.defineProperty(router, key, {
          value: next,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      },
    });
  }

  return reads;
}

function nonZero(reads: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(reads).filter(([, n]) => n > 0));
}

async function main(): Promise<void> {
  const routes = [{ name: "home", path: "/home" }] as never;
  const router = createRouter(routes);

  const entries: Entry[] = [
    ["getInternals", (r) => getInternals(r as never)],
    ["getPluginApi", (r) => getPluginApi(r as never)],
    ["getRoutesApi", (r) => getRoutesApi(r as never)],
    ["getDependenciesApi", (r) => getDependenciesApi(r as never)],
    ["getLifecycleApi", (r) => getLifecycleApi(r as never)],
    ["cloneRouter", (r) => cloneRouter(r as never)],
    ["getNavigator (censused control)", (r) => getNavigator(r as never)],
  ];

  // ---- Q1 + Q2 on a pass-through Proxy (reads counted, identity differs) ----
  const q1: Record<string, { outcome: string; readsBeforeDecision: Record<string, number> }> = {};

  for (const [name, call] of entries) {
    const { proxy, reads } = countingProxy(router);

    q1[name] = { outcome: outcome(() => call(proxy)), readsBeforeDecision: nonZero(reads) };
  }

  // ---- Q2 on the two other copy shapes ----
  const spread = { ...router };
  const inherited = Object.create(router) as typeof router;
  const q2: Record<string, Record<string, string>> = {};

  for (const [name, call] of entries) {
    q2[name] = {
      "spread copy": outcome(() => call(spread)),
      "Object.create(router)": outcome(() => call(inherited)),
      "real router (positive control)": outcome(() => call(router)),
    };
  }

  // Positive control that the SPREAD copy is a WORKING router facade: its own bound
  // methods answer for the real instance. This is what makes Q2 a semantic break and
  // not a type error — the copy is a router in every respect except identity.
  await router.start("/home");
  const spreadWorks = {
    "spread.getState().name": spread.getState()?.name,
    "spread.isActive()": spread.isActive(),
    "spread.buildPath('home')": spread.buildPath("home"),
    "spread.isActiveRoute('home')": spread.isActiveRoute("home"),
    "Object.create(router).getState().name": inherited.getState()?.name,
    "own keys carried by the spread": Object.keys(spread).length,
  };

  // ---- Q3 cache identity ----
  const q3 = {
    "getInternals(r) === getInternals(r)": getInternals(router) === getInternals(router),
    "getPluginApi(r) === getPluginApi(r)": getPluginApi(router) === getPluginApi(router),
    "getRoutesApi(r) === getRoutesApi(r)": getRoutesApi(router) === getRoutesApi(router),
    "getNavigator(r) === getNavigator(r)": getNavigator(router) === getNavigator(router),
    "getDependenciesApi(r) === getDependenciesApi(r)":
      getDependenciesApi(router) === getDependenciesApi(router),
    "getLifecycleApi(r) === getLifecycleApi(r)":
      getLifecycleApi(router) === getLifecycleApi(router),
    "getPluginApi frozen": Object.isFrozen(getPluginApi(router)),
    "getRoutesApi frozen": Object.isFrozen(getRoutesApi(router)),
    "getDependenciesApi frozen": Object.isFrozen(getDependenciesApi(router)),
    "getLifecycleApi frozen": Object.isFrozen(getLifecycleApi(router)),
    "router instance itself frozen": Object.isFrozen(router),
  };

  // ---- Q4 later-frame reads through the HELD handle (fresh instance) ----
  const r2 = createRouter(routes);
  const reads2 = instrumentOwnKeys(r2);
  const snapshot = (): Record<string, number> => ({ ...nonZero(reads2) });

  getInternals(r2);
  const afterGetInternals = snapshot();
  const pluginApi = getPluginApi(r2);
  const afterGetPluginApi = snapshot();
  const routesApi = getRoutesApi(r2);
  const afterGetRoutesApi = snapshot();
  getDependenciesApi(r2);
  getLifecycleApi(r2);
  const afterDepsAndLifecycle = snapshot();
  getNavigator(r2);
  const afterGetNavigator = snapshot();

  const beforeReplace = snapshot();

  routesApi.replace([{ name: "home", path: "/home" }] as never);
  const afterReplaceStopped = snapshot();
  await r2.start("/home");
  const beforeReplaceStarted = snapshot();

  routesApi.replace([{ name: "home", path: "/home" }] as never);
  const afterReplaceStarted = snapshot();

  const beforeExtend = snapshot();
  const unExtend = pluginApi.extendRouter({ myExt: 1 });
  const afterExtend = snapshot();

  unExtend();

  const delta = (
    a: Record<string, number>,
    b: Record<string, number>,
  ): Record<string, number> => {
    const out: Record<string, number> = {};

    for (const [k, v] of Object.entries(b)) {
      if (v - (a[k] ?? 0) > 0) {
        out[k] = v - (a[k] ?? 0);
      }
    }

    return out;
  };

  const q4 = {
    "reads during getInternals(r2)": afterGetInternals,
    "reads during getPluginApi(r2) (delta)": delta(afterGetInternals, afterGetPluginApi),
    "reads during getRoutesApi(r2) (delta)": delta(afterGetPluginApi, afterGetRoutesApi),
    "reads during getDependenciesApi+getLifecycleApi (delta)": delta(
      afterGetRoutesApi,
      afterDepsAndLifecycle,
    ),
    "reads during getNavigator(r2) (delta) — control, expects 7 slots": delta(
      afterDepsAndLifecycle,
      afterGetNavigator,
    ),
    "reads during routesApi.replace() on a STOPPED router (delta)": delta(
      beforeReplace,
      afterReplaceStopped,
    ),
    "reads during routesApi.replace() on a STARTED router (delta)": delta(
      beforeReplaceStarted,
      afterReplaceStarted,
    ),
    "reads during pluginApi.extendRouter({myExt}) (delta)": delta(beforeExtend, afterExtend),
    "extension landed on the instance as own data prop": Object.getOwnPropertyDescriptor(
      r2,
      "myExt",
    )?.value,
  };

  // Late-swap: does replace() read `getState` by NAME at call time (a swap installed
  // AFTER getRoutesApi was built is honoured) — the (b) shape "handle held, read per frame".
  const r3 = createRouter(routes);
  const api3 = getRoutesApi(r3);

  await r3.start("/home");
  let swappedCalls = 0;
  const realGetState = r3.getState;

  (r3 as { getState: unknown }).getState = () => {
    swappedCalls += 1;

    return realGetState();
  };
  api3.replace([{ name: "home", path: "/home" }] as never);
  const lateSwap = {
    "replace() called the getState installed AFTER getRoutesApi": swappedCalls,
  };

  console.log(
    JSON.stringify({ q1, q2, spreadWorks, q3, q4, lateSwap }, null, 2),
  );
  router.dispose();
  r2.dispose();
  r3.dispose();
}

void main();
