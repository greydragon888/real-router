import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";

import type { PluginFactory, Route, Router } from "@real-router/core";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974): on that router
 * and on a clone, which re-runs the base's factories, with a factory of its
 * own or with the first one's, and with `validation-plugin` on the base or
 * without it.
 */
const MESSAGE =
  "[@real-router/lifecycle-plugin] is already registered on this router — a clone already carries the plugins of its base router";

type Row<F> = readonly [label: string, run: F];

const BASES: readonly Row<(router: Router) => void>[] = [
  ["without validation-plugin", () => undefined],
  [
    "with validation-plugin on the base",
    (router) => {
      router.usePlugin(validationPlugin());
    },
  ],
];

const TARGETS: readonly Row<(base: Router) => Router>[] = [
  ["the same router", (base) => base],
  ["a clone", (base) => cloneRouter(base)],
];

// `lifecyclePluginFactory()` returns the same function on every call, so both
// repeats hand the router the first one's factory object.
const REPEATS: readonly Row<
  (first: PluginFactory, own: PluginFactory) => PluginFactory
>[] = [
  ["a factory of its own", (_first, own) => own],
  ["the first one's factory", (first) => first],
];

const MATRIX = BASES.flatMap(([base, prepare]) =>
  TARGETS.flatMap(([target, reach]) =>
    REPEATS.map(([repeat, pick]) => ({
      label: `${base}, on ${target}, with ${repeat}`,
      prepare,
      reach,
      pick,
    })),
  ),
);

/** Routes whose `home` counts the runs of its `onNavigate` hook. */
function countingRoutes(): { routes: Route[]; runs: () => number } {
  let count = 0;

  return {
    routes: [
      {
        name: "home",
        path: "/",
        onNavigate: () => () => {
          count++;
        },
      },
    ],
    runs: () => count,
  };
}

/** The error `register` throws; a registration that passes fails the cell. */
function refusalOf(register: () => unknown): Error {
  try {
    register();
  } catch (error) {
    return error as Error;
  }

  throw new Error("the registration was accepted");
}

describe("lifecycle-plugin refuses a repeat registration (#2974)", () => {
  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ prepare, reach, pick }) => {
      const counted = countingRoutes();
      const base = createRouter(counted.routes, { defaultRoute: "home" });

      prepare(base);

      const factory = lifecyclePluginFactory();

      base.usePlugin(factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(pick(factory, lifecyclePluginFactory())),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      await router.start("/");

      expect(counted.runs()).toBe(1);

      router.dispose();
      base.dispose();
    },
  );

  it("after the first instance is unsubscribed, a registration is accepted", async () => {
    const counted = countingRoutes();
    const router = createRouter(counted.routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(lifecyclePluginFactory());

    unsubscribe();
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    expect(counted.runs()).toBe(1);

    router.dispose();
  });

  it("a registration core refuses leaves the router open to the next one", async () => {
    const counted = countingRoutes();
    const router = createRouter(counted.routes, {
      defaultRoute: "home",
      limits: { maxListeners: 1 },
    });
    // The one tree-change listener the limit allows is taken, so core refuses
    // the plugin's subscription.
    const removeListener = getRoutesApi(router).subscribeChanges(
      () => undefined,
    );

    expect(() => router.usePlugin(lifecyclePluginFactory())).toThrow(
      '[router] Listener limit (1) reached for "TREE_CHANGED"',
    );

    removeListener();
    router.usePlugin(lifecyclePluginFactory());

    await router.start("/");

    expect(counted.runs()).toBe(1);

    router.dispose();
  });

  it("a refused repeat registers nothing before it throws", () => {
    const counted = countingRoutes();
    // The first instance takes the one listener each event allows, so a
    // subscription the repeat made before its check would meet the limit
    // first.
    const router = createRouter(counted.routes, {
      defaultRoute: "home",
      limits: { maxListeners: 1 },
    });

    router.usePlugin(lifecyclePluginFactory());

    expect(() => router.usePlugin(lifecyclePluginFactory())).toThrow(MESSAGE);

    router.dispose();
  });
});
