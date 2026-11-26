import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";
import { describe, expect, it } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import type { PluginFactory, Route, Router } from "@real-router/core";
import type {
  StandardSchemaV1,
  StandardSchemaV1Result,
} from "@real-router/search-schema-plugin";

/**
 * A registration on a router that already carries the plugin throws the
 * plugin's own `Error` before it registers anything (#2974): on that router
 * and on a clone, which re-runs the base's factories, with a factory of its
 * own or with the first one's, and with `validation-plugin` on the base or
 * without it.
 */
const MESSAGE =
  "[search-schema-plugin] is already registered on this router — a clone already carries the plugins of its base router";

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

/** Routes whose `list` has a schema that passes everything and counts runs. */
function countingRoutes(): { routes: Route[]; runs: () => number } {
  let count = 0;
  const schema: StandardSchemaV1 = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        count++;

        return { value };
      },
    },
  };

  return {
    routes: [
      { name: "home", path: "/" },
      { name: "list", path: "/list?page", searchSchema: schema },
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

describe("search-schema-plugin refuses a repeat registration (#2974)", () => {
  it.each(MATRIX)(
    "$label: the repeat throws the plugin's own error, and the first instance alone works",
    async ({ prepare, reach, pick }) => {
      // The same router and plugins, with no repeat: the schema runs once per
      // run of the one instance.
      const single = countingRoutes();
      const singleBase = createRouter(single.routes, { defaultRoute: "home" });

      prepare(singleBase);
      singleBase.usePlugin(searchSchemaPlugin());

      const singleRouter = reach(singleBase);

      await singleRouter.start("/list?page=1");

      const counted = countingRoutes();
      const base = createRouter(counted.routes, { defaultRoute: "home" });

      prepare(base);

      const factory = searchSchemaPlugin();

      base.usePlugin(factory);

      const router = reach(base);
      const error = refusalOf(() =>
        router.usePlugin(pick(factory, searchSchemaPlugin())),
      );

      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect("code" in error).toBe(false);
      expect(error.message).toBe(MESSAGE);

      await router.start("/list?page=1");

      expect(single.runs()).toBeGreaterThan(0);
      expect(counted.runs()).toBe(single.runs());

      singleRouter.dispose();
      singleBase.dispose();
      router.dispose();
      base.dispose();
    },
  );

  it("after the first instance is unsubscribed, a registration is accepted", async () => {
    const counted = countingRoutes();
    const router = createRouter(counted.routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(searchSchemaPlugin());

    unsubscribe();
    router.usePlugin(searchSchemaPlugin());

    await router.start("/list?page=1");

    expect(counted.runs()).toBeGreaterThan(0);

    router.dispose();
  });

  it("a registration the defaultSearch check refuses leaves the router open to the next one", async () => {
    let answers = false;
    let runs = 0;
    const schema: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          runs++;

          return (answers ? { value } : {}) as StandardSchemaV1Result;
        },
      },
    };
    const router = createRouter(
      [
        { name: "home", path: "/" },
        {
          name: "list",
          path: "/list?page",
          defaultSearch: { page: "1" },
          searchSchema: schema,
        },
      ],
      { defaultRoute: "home" },
    );

    // In mode "development" the plugin checks each `defaultSearch` when it is
    // registered, and an answer with no issues and no value is refused there.
    expect(() => router.usePlugin(searchSchemaPlugin())).toThrow(
      '[search-schema-plugin] Route "list": ~standard.validate() answered with no issues and no "value", which is not a Standard Schema result.',
    );

    answers = true;
    router.usePlugin(searchSchemaPlugin());

    const registered = runs;

    await router.start("/list?page=2");

    expect(runs).toBeGreaterThan(registered);

    router.dispose();
  });
});
