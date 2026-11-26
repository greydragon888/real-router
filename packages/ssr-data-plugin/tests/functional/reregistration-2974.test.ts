import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974): on that router
 * and on a clone, which re-runs the base's factories, with a factory of its
 * own or with the first one's, and with `validation-plugin` on the base or
 * without it.
 */
const MESSAGE =
  "[@real-router/ssr-data-plugin] is already registered on this router — a clone already carries the plugins of its base router";

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

/** A plugin factory whose loader for `a` returns `data` and counts its runs. */
function loading(data: object): { factory: PluginFactory; runs: () => number } {
  let count = 0;

  return {
    factory: ssrDataPluginFactory({
      a: () => async () => {
        count++;

        return data;
      },
    }),
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

describe("ssr-data-plugin refuses a repeat registration (#2974)", () => {
  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ prepare, reach, pick }) => {
      const first = loading({ from: "first" });
      const own = loading({ from: "own" });
      const base = createRouter(routes, { defaultRoute: "home" });

      prepare(base);
      base.usePlugin(first.factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(pick(first.factory, own.factory)),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      const state = await router.start("/a");

      expect(state.context.data).toStrictEqual({ from: "first" });
      expect(first.runs()).toBe(1);
      expect(own.runs()).toBe(0);

      router.dispose();
      base.dispose();
    },
  );

  it("after the first instance is unsubscribed, a registration is accepted", async () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(loading({ from: "first" }).factory);

    unsubscribe();
    router.usePlugin(loading({ from: "next" }).factory);

    const state = await router.start("/a");

    expect(state.context.data).toStrictEqual({ from: "next" });

    router.dispose();
  });

  it("another plugin holding `data` meets core's refusal, and its removal leaves the router open", () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    const removeHolder = router.usePlugin((holder) => {
      const claim = getPluginApi(holder).claimContextNamespace("data");

      return {
        teardown: () => {
          claim.release();
        },
      };
    });

    expect(() => router.usePlugin(loading({ from: "first" }).factory)).toThrow(
      '[router.claimContextNamespace] Cannot claim context namespace: "data" is already claimed by another plugin',
    );

    removeHolder();

    expect(() =>
      router.usePlugin(loading({ from: "first" }).factory),
    ).not.toThrow();

    router.dispose();
  });

  it("a loader factory that throws leaves the router open to the next registration", () => {
    const router = createRouter(routes, { defaultRoute: "home" });
    const failure = new Error("the loader's dependency is not set");

    expect(() =>
      router.usePlugin(
        ssrDataPluginFactory({
          a: () => {
            throw failure;
          },
        }),
      ),
    ).toThrow(failure);

    expect(() =>
      router.usePlugin(loading({ from: "first" }).factory),
    ).not.toThrow();

    router.dispose();
  });
});
