import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { preloadPluginFactory } from "@real-router/preload-plugin";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974), with a document
 * and without one: on that router and on a clone, which re-runs the base's
 * factories, with a factory of its own or with the first one's, and with
 * `validation-plugin` on the base or without it.
 */
const MESSAGE =
  "[@real-router/preload-plugin] is already registered on this router — a clone already carries the plugins of its base router";

const routes = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
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

/** The error `register` throws; a registration that passes fails the cell. */
function refusalOf(register: () => unknown): Error {
  try {
    register();
  } catch (error) {
    return error as Error;
  }

  throw new Error("the registration was accepted");
}

/** The repeat on the router `reach` gives, after a first registration. */
function repeatOn(
  { prepare, reach, pick }: (typeof MATRIX)[number],
  base: Router,
): { router: Router; error: Error } {
  prepare(base);

  const factory = preloadPluginFactory({ delay: 150 });

  base.usePlugin(factory);

  const router = reach(base);
  const error = refusalOf(() =>
    router.usePlugin(pick(factory, preloadPluginFactory({ delay: 300 }))),
  );

  return { router, error };
}

describe("preload-plugin refuses a repeat registration (#2974)", () => {
  describe("with a document", () => {
    it.each(MATRIX)(
      "$label: the repeat throws the plugin's own error, and the first instance alone works",
      (row) => {
        const base = createRouter(routes, { defaultRoute: "home" });
        const { router, error } = repeatOn(row, base);

        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect("code" in error).toBe(false);
        expect(error.message).toBe(MESSAGE);
        expect(router.getPreloadSettings()).toStrictEqual({
          delay: 150,
          networkAware: true,
        });

        router.dispose();
        base.dispose();
      },
    );

    it("after the first instance is unsubscribed, a registration is accepted", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const unsubscribe = router.usePlugin(
        preloadPluginFactory({ delay: 150 }),
      );

      unsubscribe();
      router.usePlugin(preloadPluginFactory({ delay: 300 }));

      expect(router.getPreloadSettings()).toStrictEqual({
        delay: 300,
        networkAware: true,
      });

      router.dispose();
    });

    it("a registration core refuses leaves the router open to the next one", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      // Another plugin holds `getPreloadSettings`, so core refuses the plugin's
      // extension.
      const removeHolder = router.usePlugin((holder) => ({
        teardown: getPluginApi(holder).extendRouter({
          getPreloadSettings: () => undefined,
        }),
      }));

      expect(() => router.usePlugin(preloadPluginFactory())).toThrow(
        '[router.extendRouter] Cannot extend router: property "getPreloadSettings" already exists',
      );

      removeHolder();

      expect(() => router.usePlugin(preloadPluginFactory())).not.toThrow();

      router.dispose();
    });
  });

  describe("without a document", () => {
    beforeEach(() => {
      vi.stubGlobal("document", undefined);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it.each(MATRIX)(
      "$label: the repeat throws the plugin's own error",
      async (row) => {
        const base = createRouter(routes, { defaultRoute: "home" });
        const { router, error } = repeatOn(row, base);

        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect("code" in error).toBe(false);
        expect(error.message).toBe(MESSAGE);

        await expect(router.start("/a")).resolves.toMatchObject({ name: "a" });

        router.dispose();
        base.dispose();
      },
    );

    it("after the first instance is unsubscribed, a registration is accepted", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const unsubscribe = router.usePlugin(preloadPluginFactory());

      unsubscribe();

      expect(() => router.usePlugin(preloadPluginFactory())).not.toThrow();

      router.dispose();
    });
  });
});
