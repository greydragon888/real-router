import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import {
  rscActionPluginFactory,
  rscServerPluginFactory,
} from "@real-router/rsc-server-plugin";

import type { PluginFactory, Router } from "@real-router/core";
import type { RscActionResult } from "@real-router/rsc-server-plugin";
import type { ReactNode } from "react";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974), for each of the
 * package's two plugins: on that router and on a clone, which re-runs the
 * base's factories, with a factory of its own or with the first one's, and
 * with `validation-plugin` on the base or without it.
 */
const MESSAGE =
  "[@real-router/rsc-server-plugin] is already registered on this router — a clone already carries the plugins of its base router";

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

// A plain "ReactNode-like" object: the plumbing is under test, not React.
const node = (kind: string): ReactNode =>
  ({
    type: kind,
    props: {},
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

/** A plugin factory whose loader for `a` returns `rendered`, counting runs. */
function rendering(rendered: ReactNode): {
  factory: PluginFactory;
  runs: () => number;
} {
  let count = 0;

  return {
    factory: rscServerPluginFactory({
      a: () => () => {
        count++;

        return rendered;
      },
    }),
    runs: () => count,
  };
}

/** A plugin factory that publishes `result`, counting the reads of it. */
function answering(result: RscActionResult): {
  factory: PluginFactory;
  runs: () => number;
} {
  let count = 0;

  return {
    factory: rscActionPluginFactory(() => {
      count++;

      return result;
    }),
    runs: () => count,
  };
}

/** A plugin that holds `namespace`, released on its teardown. */
const holding =
  (namespace: string): PluginFactory =>
  (holder) => {
    const claim = getPluginApi(holder).claimContextNamespace(namespace);

    return {
      teardown: () => {
        claim.release();
      },
    };
  };

/** The error `register` throws; a registration that passes fails the cell. */
function refusalOf(register: () => unknown): Error {
  try {
    register();
  } catch (error) {
    return error as Error;
  }

  throw new Error("the registration was accepted");
}

describe("rsc-server-plugin refuses a repeat registration (#2974)", () => {
  describe("rscServerPluginFactory", () => {
    it.each(MATRIX)(
      "$label: the repeat throws the plugin's own error, and the first instance alone works",
      async ({ prepare, reach, pick }) => {
        const firstNode = node("First");
        const first = rendering(firstNode);
        const own = rendering(node("Own"));
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

        expect(state.context.rsc).toBe(firstNode);
        expect(first.runs()).toBe(1);
        expect(own.runs()).toBe(0);

        router.dispose();
        base.dispose();
      },
    );

    it("after the first instance is unsubscribed, a registration is accepted", async () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const unsubscribe = router.usePlugin(rendering(node("First")).factory);
      const nextNode = node("Next");

      unsubscribe();
      router.usePlugin(rendering(nextNode).factory);

      const state = await router.start("/a");

      expect(state.context.rsc).toBe(nextNode);

      router.dispose();
    });

    it("a registration core refuses leaves the router open to the next one", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const removeHolder = router.usePlugin(holding("rsc"));

      expect(() => router.usePlugin(rendering(node("First")).factory)).toThrow(
        '[router.claimContextNamespace] Cannot claim context namespace: "rsc" is already claimed by another plugin',
      );

      removeHolder();

      expect(() =>
        router.usePlugin(rendering(node("First")).factory),
      ).not.toThrow();

      router.dispose();
    });

    it("a loader factory that throws leaves the router open to the next registration", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const failure = new Error("the loader's dependency is not set");

      expect(() =>
        router.usePlugin(
          rscServerPluginFactory({
            a: () => {
              throw failure;
            },
          }),
        ),
      ).toThrow(failure);

      expect(() =>
        router.usePlugin(rendering(node("First")).factory),
      ).not.toThrow();

      router.dispose();
    });
  });

  describe("rscActionPluginFactory", () => {
    it.each(MATRIX)(
      "$label: the repeat throws the plugin's own error, and the first instance alone works",
      async ({ prepare, reach, pick }) => {
        const firstResult: RscActionResult = {
          returnValue: { ok: true, data: "first" },
        };
        const first = answering(firstResult);
        const own = answering({ returnValue: { ok: true, data: "own" } });
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

        expect(state.context.rscAction).toStrictEqual(firstResult);
        expect(first.runs()).toBe(1);
        expect(own.runs()).toBe(0);

        router.dispose();
        base.dispose();
      },
    );

    it("after the first instance is unsubscribed, a registration is accepted", async () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const nextResult: RscActionResult = {
        returnValue: { ok: true, data: "next" },
      };
      const unsubscribe = router.usePlugin(
        answering({ returnValue: { ok: true, data: "first" } }).factory,
      );

      unsubscribe();
      router.usePlugin(answering(nextResult).factory);

      const state = await router.start("/a");

      expect(state.context.rscAction).toStrictEqual(nextResult);

      router.dispose();
    });

    it("a registration core refuses leaves the router open to the next one", () => {
      const router = createRouter(routes, { defaultRoute: "home" });
      const removeHolder = router.usePlugin(holding("rscAction"));

      expect(() =>
        router.usePlugin(rscActionPluginFactory(() => undefined)),
      ).toThrow(
        '[router.claimContextNamespace] Cannot claim context namespace: "rscAction" is already claimed by another plugin',
      );

      removeHolder();

      expect(() =>
        router.usePlugin(rscActionPluginFactory(() => undefined)),
      ).not.toThrow();

      router.dispose();
    });
  });

  it("the two plugins of the package and ssr-data-plugin are three plugins: one router takes each", async () => {
    // Each creator keeps a set of its own, though both loader plugins are
    // built by one factory of `shared/ssr`.
    const router = createRouter(routes, { defaultRoute: "home" });
    const rendered = node("First");
    const result: RscActionResult = { returnValue: { ok: true, data: 1 } };

    router.usePlugin(
      rendering(rendered).factory,
      answering(result).factory,
      ssrDataPluginFactory({ a: () => () => ({ from: "ssr-data" }) }),
    );

    const state = await router.start("/a");

    expect(state.context.rsc).toBe(rendered);
    expect(state.context.rscAction).toStrictEqual(result);
    expect(state.context.data).toStrictEqual({ from: "ssr-data" });

    router.dispose();
  });
});
