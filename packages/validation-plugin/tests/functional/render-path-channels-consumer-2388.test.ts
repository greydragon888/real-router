import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { beforeEach, describe, expect, it } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { Router } from "@real-router/core";

/**
 * The render-path doors and the state builders refuse through checks, and
 * `buildPath` and `isActiveRoute` report a declared query name handed in the
 * path bag through a diagnostic kind each (#2388).
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "users", path: "/users/:id?q" },
  { name: "list", path: "/list?q" },
  {
    name: "dec",
    path: "/dec/:id",
    decodeParams: () => ({ params: ["x"], search: {} }),
  },
];

type Mode = "bare" | "installed" | "torn down";

type Options = Record<string, unknown>;

const warnings: string[] = [];

/**
 * What the router's logger received at `warn`, one line per call, as the
 * console prints it: the plugin reports through the router's logger (#2975).
 */
const warned = (): string[] => [...warnings];

const routerIn = (mode: Mode, options: Options = {}): Router => {
  const router = createRouter(
    ROUTES as never,
    {
      ...options,
      logger: {
        level: "none",
        callbackIgnoresLevel: true,
        callback: (
          level: string,
          context: string,
          message: string,
          ...args: unknown[]
        ) => {
          if (level === "warn") {
            warnings.push(
              [`[${context}] ${message}`, ...args].map(String).join(" "),
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

  return router;
};

/** The warning the plugin prints for `key` handed in the path bag of `route`. */
const misChanneled = (route: string, key: string): string =>
  `[router] Route "${route}" declares \`${key}\` as a query param, but it was given in the ` +
  `\`params\` bag — the path channel. The URL is built without it, so the href does not match ` +
  `what you asked for; a plain click throws, but a ⌘-click, a copied link and server-rendered ` +
  `markup all follow the wrong URL in silence. Pass it in \`search\` instead.`;

describe("#2388 — the render-path doors, as this plugin consumes the channels", () => {
  beforeEach(() => {
    warnings.length = 0;
  });

  describe("teardown removes every registration of these doors (#2388)", () => {
    // ⚑ One row per registration: an input it refuses or reports and bare core
    // does not, after teardown too. The installed arm asserts that the row
    // reaches the plugin at all.
    const ROWS: readonly (readonly [
      label: string,
      options: Options,
      run: (router: Router) => unknown,
    ])[] = [
      ["buildPath:entry", {}, (router) => router.buildPath(42 as never)],
      [
        "buildPathResolved:entry",
        {},
        (router) =>
          getPluginApi(router).buildPathResolved(
            "home",
            undefined,
            42 as never,
          ),
      ],
      [
        "isActiveRoute:entry",
        {},
        (router) => router.isActiveRoute(42 as never),
      ],
      [
        "areStatesEqual:entry",
        {},
        (router) => router.areStatesEqual(42 as never, 42 as never),
      ],
      [
        "shouldUpdateNode:entry",
        {},
        (router) => router.shouldUpdateNode(42 as never),
      ],
      [
        "matchPath:entry",
        {},
        (router) => getPluginApi(router).matchPath(42 as never),
      ],
      [
        "matchPath:decoded",
        {},
        (router) => getPluginApi(router).matchPath("/dec/1"),
      ],
      [
        "makeState:state",
        {},
        (router) => getPluginApi(router).makeState(42 as never, {}),
      ],
      [
        "navigate:state",
        // ⚑ The defaults reach the pipeline without the facade's entry checks,
        // so this position is what judges the bag a callback returns. A `Map`
        // has no own key, so no report of the plugin's speaks about it.
        { defaultRoute: "home", defaultParams: () => new Map() },
        async (router) => {
          await router.start("/list");
          await router.navigateToDefault();
        },
      ],
      ["BUILD_PATH", {}, (router) => router.buildPath("list", { q: "1" })],
      [
        "IS_ACTIVE_ROUTE",
        {},
        (router) => router.isActiveRoute("list", { q: "1" }),
      ],
    ];

    const outcomeOf = async (
      mode: Mode,
      options: Options,
      run: (router: Router) => unknown,
    ) => {
      const router = routerIn(mode, options);
      let thrown = "no throw";

      warnings.length = 0;

      try {
        await run(router);
      } catch (error) {
        thrown = (error as Error).message;
      }

      router.dispose();

      return { thrown, warned: warned() };
    };

    it.each(ROWS)(
      "%s: after teardown the door answers as bare core does",
      async (_label, options, run) => {
        const bare = await outcomeOf("bare", options, run);

        await expect(
          outcomeOf("installed", options, run),
          "the row reaches the plugin",
        ).resolves.not.toStrictEqual(bare);
        await expect(
          outcomeOf("torn down", options, run),
        ).resolves.toStrictEqual(bare);
      },
    );
  });

  describe("the printing predicates report after their entry checks (#2388)", () => {
    // ⚑ Core raises each door's kind after the door's `:entry` position: a call
    // the entry refuses reports nothing, and the warning waits for the first
    // call that passes.
    const DOORS = {
      buildPath: (router: Router, search: unknown) =>
        router.buildPath("list", { q: "1" }, search as never),
      isActiveRoute: (router: Router, search: unknown) =>
        router.isActiveRoute("list", { q: "1" }, search as never),
    };

    it.each(Object.keys(DOORS) as (keyof typeof DOORS)[])(
      "%s: the entry refuses a bad search without the report, and the next call reports",
      (door) => {
        const router = routerIn("installed");

        expect(() => DOORS[door](router, "page=2")).toThrow(
          new TypeError(
            `[router.${door}] search must be a plain object, got string`,
          ),
        );
        expect(warned()).toStrictEqual([]);

        DOORS[door](router, { page: "2" });

        expect(warned()).toStrictEqual([misChanneled("list", "q")]);

        router.dispose();
      },
    );

    it("buildPath: the report comes before the refusal of core's copy", () => {
      // ⚑ The value walk at `buildPath:params` judges the copy, which core makes
      // after the report: a call that carries both defects warns and then throws.
      const router = routerIn("installed");

      expect(() =>
        router.buildPath("users", { id: Symbol("x"), q: "1" } as never),
      ).toThrow(
        new TypeError(
          '[router.buildPath] param "id" cannot be a symbol — it does not round-trip through the URL path. Use a string, number, or boolean.',
        ),
      );
      expect(warned()).toStrictEqual([misChanneled("users", "q")]);

      router.dispose();
    });
  });

  describe("a refusal names the door that was called (#2388)", () => {
    // ⚑ Each check passes its door's name to the leaf that writes the
    // message, so the name is pinned on the message itself. These three are
    // the names no other cell holds.
    it("makeState:state names makeState", () => {
      const router = routerIn("installed");

      expect(() =>
        getPluginApi(router).makeState("home", {}, "x" as never),
      ).toThrow(
        new TypeError(
          "[router.makeState] search must be a plain object, got string",
        ),
      );

      router.dispose();
    });

    it("buildPathResolved:entry names buildPathResolved, for either bag", () => {
      const router = routerIn("installed");
      const api = getPluginApi(router);

      expect(() =>
        api.buildPathResolved("home", undefined, 42 as never),
      ).toThrow(
        new TypeError(
          "[router.buildPathResolved] search must be a plain object, got number",
        ),
      );
      expect(() =>
        api.buildPathResolved("home", Object.create({ x: 1 }) as never),
      ).toThrow(
        new TypeError(
          "[router.buildPathResolved] params must be a plain object, got object",
        ),
      );

      router.dispose();
    });
  });
});
