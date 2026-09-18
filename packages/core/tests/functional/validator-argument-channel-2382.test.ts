import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/core/api";

/**
 * No argument core hands a `RouterValidator` method is REACHABLE from either
 * live store, except what `PluginApi` already publishes (#2382).
 *
 * ⚑ **Reachability, not identity, and the difference is the whole test.** An
 * identity check against a store object passes every NARROWED form — handing
 * `store.matcher`, `config.forwardMap` or a `{ dependencies }` wrapper — so it
 * cannot tell this design from the ones it replaced. The universe below is
 * built by walking FROM the stores, which is why a descendant is caught and a
 * copy is not.
 *
 * ⚠ **Published subgraphs are subtracted, not single objects.** `getTree()`
 * returns `store.tree` itself, whose `children` Maps are in the universe too, and
 * `getResolvedLimits()` returns `store.limits`, which
 * `plugins.validatePluginLimit` receives. Subtracting only the roots would red
 * both.
 *
 * ⚠ **Judged AT CALL TIME, against the stores as they are then.** `replace()`
 * rebuilds the matcher and the tree, so a universe built after the doors ran
 * misses a container that was live when it was handed over — measured: a
 * mutation passing `store.matcher` to `validateUpdateRoute` stayed green that
 * way.
 *
 * ⚠ The rejected forms run through the same gate as negative controls, so a gate
 * that stopped catching anything fails rather than passes quietly.
 */

interface Call {
  method: string;
  reachesStore: boolean;
}

interface Internals {
  validator: unknown;
  routeGetStore: () => Record<string, unknown>;
  dependenciesGetStore: () => Record<string, unknown>;
}

/** What one object leads to: own values, plus Map / Set / array members. */
function edgesOf(value: object): unknown[] {
  const out: unknown[] = [];

  if (value instanceof Map) {
    out.push(...value.values());
  } else if (value instanceof Set || Array.isArray(value)) {
    out.push(...value);
  }

  for (const key of Object.keys(value)) {
    out.push((value as Record<string, unknown>)[key]);
  }

  return out;
}

/** Every object reachable from `root` within `maxDepth` edges. */
function reachable(root: unknown, maxDepth: number): Set<object> {
  const seen = new Set<object>();
  let frontier: unknown[] = [root];

  for (let depth = 0; depth <= maxDepth; depth++) {
    const next: unknown[] = [];

    for (const value of frontier) {
      const isObject = typeof value === "object" || typeof value === "function";

      if (!isObject || value === null || seen.has(value)) {
        continue;
      }

      seen.add(value);
      next.push(...edgesOf(value));
    }

    frontier = next;
  }

  return seen;
}

/** "Does this value reach a store?", with the published subgraphs subtracted. */
function buildGate(router: Router): (value: unknown) => boolean {
  const ctx = getInternals(router) as unknown as Internals;
  const api = getPluginApi(router);
  const universe = new Set([
    ...reachable(ctx.routeGetStore(), 3),
    ...reachable(ctx.dependenciesGetStore(), 3),
  ]);

  for (const published of [
    ...reachable(api.getTree(), 64),
    ...reachable(api.getResolvedLimits(), 2),
  ]) {
    universe.delete(published);
  }

  return (value: unknown) => {
    for (const object of reachable(value, 2)) {
      if (universe.has(object)) {
        return true;
      }
    }

    return false;
  };
}

/** Records every call into every validator namespace, judged as it happens. */
function record(router: Router, calls: Call[]): void {
  const ctx = getInternals(router) as unknown as Internals;

  ctx.validator = new Proxy(
    {},
    {
      get: (_target, namespace: string) =>
        new Proxy(
          {},
          {
            get:
              (_t, method: string) =>
              (...args: unknown[]) => {
                const reaches = buildGate(router);

                calls.push({
                  method: `${namespace}.${method}`,
                  reachesStore: args.some((argument) => reaches(argument)),
                });
              },
          },
        ),
    },
  );
}

async function exerciseDoors(router: Router): Promise<void> {
  const routes = getRoutesApi(router);
  const deps = getDependenciesApi(router) as unknown as DependenciesApi<
    Record<string, unknown>
  >;

  deps.set("a", 1);
  deps.setAll({ b: 2, c: 3 });
  deps.get("a");
  deps.remove("a");
  deps.has("b");

  // `{ parent }` is what reaches `validateParentOption`.
  routes.add([{ name: "child", path: "/child" }], { parent: "shop" });
  routes.add([{ name: "old", path: "/old", forwardTo: "shop.child" }]);
  routes.update("old", { forwardTo: "home", defaultParams: { x: "1" } });
  routes.get("shop");
  routes.has("shop.child");

  getLifecycleApi(router).addActivateGuard("shop", () => () => true);
  // Reaches `plugins.validatePluginLimit`, which receives the resolved limits.
  router.usePlugin(() => ({}));

  await router.start("/");
  await router.navigate("shop.child");
  router.buildPath("shop.child");
  router.isActiveRoute("shop");
  router.canNavigateTo("home");
  // A CALLBACK `defaultRoute` is what reaches `validateResolvedDefaultRoute`.
  await router.navigateToDefault();

  cloneRouter(router).dispose();
  routes.replace([
    { name: "home", path: "/" },
    { name: "shop", path: "/shop" },
  ]);
  routes.remove("shop");
  router.stop();
}

function createDoorRouter(): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      { name: "shop", path: "/shop" },
    ],
    { defaultRoute: () => "home" },
  );
}

describe("the validator takes facts, not containers (#2382)", () => {
  it("no argument core passes is reachable from either store", async () => {
    const calls: Call[] = [];
    const router = createDoorRouter();

    record(router, calls);
    await exerciseDoors(router);

    const offenders = calls
      .filter((call) => call.reachesStore)
      .map((call) => call.method);

    expect(offenders).toStrictEqual([]);

    // Anti-vacuum: every door of the recorded channel was exercised.
    const methods = new Set(calls.map((call) => call.method));

    // ⚠ The route-CRUD members left this channel with #2388 — their arguments
    // now reach a CHECK, and `checks-take-facts-2388` is the authority for that
    // side. What stays here is the channel that still exists.
    const unexercised = [
      "dependencies.validateDependencyCount",
      "dependencies.validateDependencyExists",
      "options.validateResolvedDefaultRoute",
      "plugins.validatePluginLimit",
    ].filter((method) => !methods.has(method));

    expect(unexercised).toStrictEqual([]);
  });

  it("CONTROL — the rejected forms are caught and the published ones are not", () => {
    const router = createDoorRouter();
    const ctx = getInternals(router) as unknown as Internals;
    const api = getPluginApi(router);
    const routeStore = ctx.routeGetStore();
    const depStore = ctx.dependenciesGetStore();
    const config = routeStore.config as Record<string, unknown>;
    const record = depStore.dependencies as Record<string, unknown>;
    const reaches = buildGate(router);

    expect({
      "the routes store": reaches(routeStore),
      "the dependencies store": reaches(depStore),
      "store.matcher": reaches(routeStore.matcher),
      "store.config": reaches(config),
      "config.forwardMap": reaches(config.forwardMap),
      "store.depsStore": reaches(routeStore.depsStore),
      "store.dependencies": reaches(record),
      "a { matcher } wrapper": reaches({ matcher: routeStore.matcher }),
      "a { dependencies } wrapper": reaches({ dependencies: record }),
      "getTree()": reaches(api.getTree()),
      "getResolvedLimits()": reaches(api.getResolvedLimits()),
      "getForwardMap()": reaches(api.getForwardMap()),
      "a COPY of the record": reaches({ ...record }),
    }).toStrictEqual({
      "the routes store": true,
      "the dependencies store": true,
      "store.matcher": true,
      "store.config": true,
      "config.forwardMap": true,
      "store.depsStore": true,
      "store.dependencies": true,
      "a { matcher } wrapper": true,
      "a { dependencies } wrapper": true,
      "getTree()": false,
      "getResolvedLimits()": false,
      "getForwardMap()": false,
      "a COPY of the record": false,
    });
  });
});
