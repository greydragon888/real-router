import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { Router } from "@real-router/core";

/**
 * `navigateToState`, `setRootPath`, `navigateToDefault` and `start` refuse
 * through checks, and `navigateToDefault` reports a mutated defaults bag
 * through a diagnostic kind (#2388).
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id" },
];

type Mode = "bare" | "installed" | "torn down";

type Options = Record<string, unknown>;

/** What the router logged, one line per call: level, channel, message, args. */
const routerWithSink = (
  mode: Mode,
  options: Options,
): { router: Router; logged: string[] } => {
  const logged: string[] = [];
  const router = createRouter(
    ROUTES as never,
    {
      ...options,
      logger: {
        level: "none",
        callbackIgnoresLevel: true,
        callback: (
          level: string,
          channel: string,
          message: string,
          ...args: unknown[]
        ) => {
          if (level !== "log") {
            logged.push(
              [level, channel, message, ...args].map(String).join(" "),
            );
          }
        },
      },
    } as never,
  );

  if (mode !== "bare") {
    const remove = router.usePlugin(validationPlugin());

    if (mode === "torn down") {
      remove();
    }
  }

  logged.length = 0;

  return { router, logged };
};

/** The warning `defaultsWatch` logs for a `defaultParams` bag mutated in place. */
const MUTATED_DEFAULT_PARAMS = [
  "warn",
  "router.navigateToDefault",
  "mutating `defaultParams` after createRouter() no longer affects routing — " +
    "the router copied it at construction. Use the callback form " +
    "(`defaultParams: () => ({ … })`), which is resolved at the point of use.",
].join(" ");

/** Options whose `defaultParams` bag the caller still holds. */
const withDefaultParams = (): Options => ({
  defaultRoute: "u",
  defaultParams: { id: "1" },
});

const mutateDefaultParams = (options: Options): void => {
  (options.defaultParams as Record<string, string>).id = "2";
};

describe("teardown removes every registration of these doors (#2388)", () => {
  // ⚑ One row per registration: an input it refuses or reports and bare core
  // does not, after teardown too. The installed arm asserts that the row
  // reaches the plugin at all.
  const ROWS: readonly (readonly [
    label: string,
    options: () => Options,
    run: (router: Router, options: Options) => Promise<unknown>,
  ])[] = [
    [
      "navigateToState:entry",
      () => ({}),
      async (router) => {
        const api = getPluginApi(router);

        await router.start("/home");
        await api.navigateToState(
          api.makeState("u", { id: "1" }, undefined, "/u/1"),
          null as never,
        );
      },
    ],
    [
      "setRootPath:entry",
      () => ({}),
      async (router) => {
        getPluginApi(router).setRootPath(42 as never);
      },
    ],
    [
      "navigateToDefault:entry",
      () => ({ defaultRoute: "u", defaultParams: { id: "1" } }),
      async (router) => {
        await router.start("/home");
        await router.navigateToDefault(42 as never);
      },
    ],
    [
      "navigateToDefault:route",
      () => ({ defaultRoute: () => "ghost" }),
      async (router) => {
        await router.start("/home");
        await router.navigateToDefault();
      },
    ],
    [
      "start:entry",
      () => ({}),
      async (router) => {
        await router.start("no-slash");
      },
    ],
    [
      "NAVIGATE_TO_DEFAULT",
      withDefaultParams,
      async (router, options) => {
        await router.start("/home");
        mutateDefaultParams(options);
        await router.navigateToDefault();
      },
    ],
  ];

  const outcomeOf = async (
    mode: Mode,
    options: () => Options,
    run: (router: Router, options: Options) => Promise<unknown>,
  ) => {
    const bag = options();
    const { router, logged } = routerWithSink(mode, bag);
    let thrown = "no throw";

    try {
      await run(router, bag);
    } catch (error) {
      thrown = (error as Error).message;
    }

    router.dispose();

    return { thrown, logged };
  };

  it.each(ROWS)(
    "%s: after teardown the door answers as bare core does",
    async (_label, options, run) => {
      const bare = await outcomeOf("bare", options, run);

      await expect(
        outcomeOf("installed", options, run),
        "the row reaches the plugin",
      ).resolves.not.toStrictEqual(bare);
      await expect(outcomeOf("torn down", options, run)).resolves.toStrictEqual(
        bare,
      );
    },
  );
});

describe("navigateToDefault reports a mutated defaults bag after its entry checks (#2388)", () => {
  // ⚑ Core raises the report after the `navigateToDefault:entry` position and
  // before it resolves the defaults: a call the entry refuses reports nothing,
  // and the report waits for the first call that passes.
  it.each([
    [{ replace: "yes" }, "object"],
    [42, "number"],
  ] as const)(
    "%o: the entry refuses it without the report, and the next call reports",
    async (argument, type) => {
      const options = withDefaultParams();
      const { router, logged } = routerWithSink("installed", options);

      await router.start("/home");
      mutateDefaultParams(options);

      expect(() => router.navigateToDefault(argument as never)).toThrow(
        new TypeError(
          `[router.navigateToDefault] Invalid options: ${type}. Expected NavigationOptions object.`,
        ),
      );
      expect(logged).toStrictEqual([]);

      await router.navigateToDefault();

      expect(logged).toStrictEqual([MUTATED_DEFAULT_PARAMS]);

      router.dispose();
    },
  );

  it("a default route the callback names wrongly is refused after the report", async () => {
    const options = { ...withDefaultParams(), defaultRoute: () => "ghost" };
    const { router, logged } = routerWithSink("installed", options);

    await router.start("/home");
    mutateDefaultParams(options);

    const refusal =
      '[router.navigateToDefault] defaultRoute callback resolved to non-existent route: "ghost"';

    await expect(router.navigateToDefault()).rejects.toThrow(refusal);
    // The refusal is a plain `Error`, so core also logs the rejection.
    expect(logged).toStrictEqual([
      MUTATED_DEFAULT_PARAMS,
      `error router Unexpected navigation error Error: ${refusal}`,
    ]);

    router.dispose();
  });
});

describe("an omitted options bag is judged as the empty one, and `null` as itself (#2388)", () => {
  it("navigateToDefault", async () => {
    const { router } = routerWithSink("installed", withDefaultParams());

    await router.start("/home");

    expect(() => router.navigateToDefault(null as never)).toThrow(
      new TypeError(
        "[router.navigateToDefault] Invalid options: null. Expected NavigationOptions object.",
      ),
    );
    await expect(router.navigateToDefault()).resolves.toMatchObject({
      name: "u",
    });

    router.dispose();
  });

  it("navigateToState", async () => {
    const { router } = routerWithSink("installed", {});
    const api = getPluginApi(router);
    const state = api.makeState("u", { id: "1" }, undefined, "/u/1");

    await router.start("/home");

    expect(() => api.navigateToState(state, null as never)).toThrow(
      new TypeError(
        "[router.navigateToState] Invalid options: null. Expected NavigationOptions object.",
      ),
    );
    await expect(api.navigateToState(state)).resolves.toMatchObject({
      name: "u",
    });

    router.dispose();
  });
});
