import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

import type { PluginFactory, Router } from "@real-router/core";
import type { PersistentParamsConfig } from "@real-router/persistent-params-plugin";

/**
 * A registration on a router that already carries the plugin, under any
 * config, throws the plugin's own `Error` before it registers anything
 * (#2974): on that router and on a clone, which re-runs the base's factories,
 * with a factory of its own or with the first one's, and with
 * `validation-plugin` on the base or without it.
 */
const MESSAGE =
  "[@real-router/persistent-params-plugin] is already registered on this router — a clone already carries the plugins of its base router";

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

/**
 * The first config, the repeat's own config, and the path `navigate("b")`
 * lands on from `/a?lang=en` while the first instance alone runs: the empty
 * config persists nothing, and `lang` would persist if the repeat registered.
 */
const CONFIGS: readonly (readonly [
  label: string,
  first: PersistentParamsConfig,
  own: PersistentParamsConfig,
  landed: string,
])[] = [
  ["a config that persists lang", ["lang"], ["theme"], "/b?lang=en"],
  ["the empty config", [], ["lang"], "/b"],
];

const MATRIX = CONFIGS.flatMap(([config, firstConfig, ownConfig, landed]) =>
  BASES.flatMap(([base, prepare]) =>
    TARGETS.flatMap(([target, reach]) =>
      REPEATS.map(([repeat, pick]) => ({
        label: `${config}, ${base}, on ${target}, with ${repeat}`,
        firstConfig,
        ownConfig,
        landed,
        prepare,
        reach,
        pick,
      })),
    ),
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

describe("persistent-params-plugin refuses a repeat registration (#2974)", () => {
  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ firstConfig, ownConfig, landed, prepare, reach, pick }) => {
      const base = createRouter(routes, { defaultRoute: "home" });

      prepare(base);

      const factory = persistentParamsPluginFactory(firstConfig);

      base.usePlugin(factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(
          pick(factory, persistentParamsPluginFactory(ownConfig)),
        ),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      await router.start("/a?lang=en");

      await expect(router.navigate("b")).resolves.toMatchObject({
        path: landed,
      });

      router.dispose();
      base.dispose();
    },
  );

  it.each(CONFIGS)(
    "after the first instance is unsubscribed, a registration is accepted — %s first",
    async (_label, firstConfig) => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const unsubscribe = router.usePlugin(
        persistentParamsPluginFactory(firstConfig),
      );

      unsubscribe();
      router.usePlugin(persistentParamsPluginFactory(["lang"]));

      await router.start("/a?lang=en");

      await expect(router.navigate("b")).resolves.toMatchObject({
        path: "/b?lang=en",
      });

      router.dispose();
    },
  );

  it("a registration core refuses leaves the router open to the next one", () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    // Another plugin holds the `persistentParams` namespace, so core refuses
    // the claim.
    const removeHolder = router.usePlugin((holder) => {
      const claim =
        getPluginApi(holder).claimContextNamespace("persistentParams");

      return {
        teardown: () => {
          claim.release();
        },
      };
    });

    expect(() =>
      router.usePlugin(persistentParamsPluginFactory(["lang"])),
    ).toThrow(
      '[router.claimContextNamespace] Cannot claim context namespace: "persistentParams" is already claimed by another plugin',
    );

    removeHolder();

    expect(() =>
      router.usePlugin(persistentParamsPluginFactory(["lang"])),
    ).not.toThrow();

    router.dispose();
  });
});
