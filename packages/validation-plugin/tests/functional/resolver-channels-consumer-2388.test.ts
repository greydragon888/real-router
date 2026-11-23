import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { ParamsSearch, Router } from "@real-router/core";

/**
 * The route resolver's three reports, as this plugin consumes them (#2388):
 * the `DROPPED_QUERY_KEY`, `UNDECLARED_PARAM_KEY` and `CODEC_ROUND_TRIP` kinds
 * warn while the plugin is installed, and a torn-down plugin leaves the router
 * as bare core leaves it. What each warning says is the subject of
 * `dropped-query-key.test.ts`, `undeclared-param-key.test.ts` and
 * `codec-round-trip.test.ts`.
 */
const lowered = ({ params, search }: ParamsSearch): ParamsSearch => ({
  params: { ...params, slug: (params.slug as string).toLowerCase() },
  search,
});

const kinded = ({ params, search }: ParamsSearch): ParamsSearch => ({
  params: { ...params, kind: "car" },
  search,
});

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "list", path: "/list?q" },
  {
    name: "cars",
    path: "/cars/:slug",
    encodeParams: lowered,
    decodeParams: kinded,
  },
];

type Mode = "bare" | "installed" | "torn down";

let warn: ReturnType<typeof vi.spyOn>;

/** What `console.warn` received, one line per call. */
const warned = (): string[] =>
  warn.mock.calls.map((call: unknown[]) => call.map(String).join(" "));

const routerIn = (mode: Mode): Router => {
  const router = createRouter(ROUTES, {
    queryParamsMode: "default",
    logger: { level: "warn-error" },
  });

  if (mode !== "bare") {
    const remove = router.usePlugin(validationPlugin());

    if (mode === "torn down") {
      remove();
    }
  }

  return router;
};

describe("#2388 — the route resolver's reports, as this plugin consumes the channels", () => {
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe("teardown removes every subscription of these kinds (#2388)", () => {
    // ⚑ One row per subscription: an input it reports and bare core does not,
    // after teardown too. The installed arm asserts that the row reaches the
    // plugin at all.
    const ROWS: readonly (readonly [
      label: string,
      run: (router: Router) => unknown,
    ])[] = [
      [
        "DROPPED_QUERY_KEY",
        (router) => router.buildPath("list", {}, { x: "1" }),
      ],
      [
        "UNDECLARED_PARAM_KEY",
        (router) =>
          getPluginApi(router).buildNavigationState("list", { zz: "1" }),
      ],
      [
        "CODEC_ROUND_TRIP",
        (router) =>
          getPluginApi(router).buildNavigationState("cars", { slug: "BMW" }),
      ],
    ];

    const warnedIn = (mode: Mode, run: (router: Router) => unknown) => {
      const router = routerIn(mode);

      warn.mockClear();
      run(router);
      router.dispose();

      return warned();
    };

    it.each(ROWS)(
      "%s: after teardown the door warns as bare core does",
      (_label, run) => {
        const bare = warnedIn("bare", run);

        expect(bare, "bare core prints nothing").toStrictEqual([]);
        expect(
          warnedIn("installed", run),
          "the row reaches the plugin",
        ).not.toStrictEqual(bare);
        expect(warnedIn("torn down", run)).toStrictEqual(bare);
      },
    );

    it("ROWS holds one row per kind", () => {
      expect(ROWS.map(([label]) => label)).toStrictEqual([
        "DROPPED_QUERY_KEY",
        "UNDECLARED_PARAM_KEY",
        "CODEC_ROUND_TRIP",
      ]);
      // The count `table-vacuity-authority` reads: an empty table would
      // register no teardown cell, in silence.
      expect(ROWS).toHaveLength(3);
    });
  });
});
