import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loggerPluginFactory } from "@real-router/logger-plugin";

import type { PluginFactory, Router } from "@real-router/core";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974): on that router
 * and on a clone, which re-runs the base's factories, with a factory of its
 * own or with the first one's, and with `validation-plugin` on the base or
 * without it.
 */
const MESSAGE =
  "[@real-router/logger-plugin] is already registered on this router — a clone already carries the plugins of its base router";

const STARTED = "[logger-plugin] Router started";

const routes = [{ name: "home", path: "/" }];

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

/** The console lines the plugin prints, muted; `started()` counts one kind. */
function muteConsole(): { started: () => number } {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

  vi.spyOn(console, "group").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);

  return {
    started: () => log.mock.calls.filter(([line]) => line === STARTED).length,
  };
}

describe("logger-plugin refuses a repeat registration (#2974)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ prepare, reach, pick }) => {
      const lines = muteConsole();
      const base = createRouter(routes, { defaultRoute: "home" });

      prepare(base);

      const factory = loggerPluginFactory();

      base.usePlugin(factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(pick(factory, loggerPluginFactory())),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      await router.start("/");

      expect(lines.started()).toBe(1);

      router.dispose();
      base.dispose();
    },
  );

  it("after the first instance is unsubscribed, a registration is accepted", async () => {
    const lines = muteConsole();
    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(loggerPluginFactory());

    unsubscribe();
    router.usePlugin(loggerPluginFactory());

    await router.start("/");

    expect(lines.started()).toBe(1);

    router.dispose();
  });
});
