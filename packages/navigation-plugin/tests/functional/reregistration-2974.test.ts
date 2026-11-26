import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import type { PluginFactory, Router } from "@real-router/core";
import type { NavigationBrowser } from "@real-router/navigation-plugin";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974): on that router
 * and on a clone, which re-runs the base's factories, with a factory of its
 * own or with the first one's, and with `validation-plugin` on the base or
 * without it.
 */
const MESSAGE =
  "[navigation-plugin] is already registered on this router — a clone already carries the plugins of its base router";

const routes = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

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

/** A browser at `location` that records the entry writes it receives. */
function spyBrowser(location: string): {
  browser: NavigationBrowser;
  writes: string[];
} {
  const writes: string[] = [];

  return {
    browser: {
      getLocation: () => location,
      getHash: () => "",
      navigate: (url) => {
        writes.push(url);
      },
      replaceState: (_state, url) => {
        writes.push(url);
      },
      updateCurrentEntry: () => {
        writes.push("updateCurrentEntry");
      },
      traverseTo: () => undefined,
      addNavigateListener: () => () => undefined,
      entries: () => [],
      currentEntry: null,
      getActivationType: () => undefined,
    },
    writes,
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

describe("navigation-plugin refuses a repeat registration (#2974)", () => {
  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ prepare, reach, pick }) => {
      const first = spyBrowser("/a");
      const own = spyBrowser("/b");
      const base = createRouter(routes, { defaultRoute: "home" });

      prepare(base);

      const factory = navigationPluginFactory({}, first.browser);

      base.usePlugin(factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(
          pick(factory, navigationPluginFactory({}, own.browser)),
        ),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      // The first instance's browser gives the start path and takes the write.
      await expect(router.start()).resolves.toMatchObject({ name: "a" });

      expect(first.writes).toStrictEqual(["/a"]);
      expect(own.writes).toStrictEqual([]);

      router.dispose();
      base.dispose();
    },
  );

  it("after the first instance is unsubscribed, a registration is accepted", async () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(
      navigationPluginFactory({}, spyBrowser("/a").browser),
    );

    unsubscribe();

    const next = spyBrowser("/b");

    router.usePlugin(navigationPluginFactory({}, next.browser));

    await expect(router.start()).resolves.toMatchObject({ name: "b" });

    expect(next.writes).toStrictEqual(["/b"]);

    router.dispose();
  });

  it("a registration core refuses leaves the router open to the next one", () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    // Another plugin holds the `navigation` namespace, so core refuses the claim.
    const removeHolder = router.usePlugin((holder) => {
      const claim = getPluginApi(holder).claimContextNamespace("navigation");

      return {
        teardown: () => {
          claim.release();
        },
      };
    });

    expect(() =>
      router.usePlugin(navigationPluginFactory({}, spyBrowser("/a").browser)),
    ).toThrow(
      '[router.claimContextNamespace] Cannot claim context namespace: "navigation" is already claimed by another plugin',
    );

    removeHolder();

    expect(() =>
      router.usePlugin(navigationPluginFactory({}, spyBrowser("/a").browser)),
    ).not.toThrow();

    router.dispose();
  });
});
