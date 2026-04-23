import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  PARAM_ROUTE_NAME,
  arbBaseSegment,
  arbIdParam,
  arbLeafRoute,
  arbNormalizedBase,
  arbUnsafeIdParam,
  arbQueryString,
  arbUrlPath,
  arbNonMatchingPath,
  createPluginRouter,
} from "./helpers";
import {
  buildUrl,
  extractPath,
  normalizeBase,
  safeParseUrl,
  shouldReplaceHistory,
} from "../../src/browser-env";

import type { NavigationOptions, State } from "@real-router/core";

describe("Browser Plugin URL Invariants", () => {
  describe("URL Roundtrip (no base)", () => {
    const router = createPluginRouter("");

    test.prop([arbLeafRoute], { numRuns: NUM_RUNS.standard })(
      "matchUrl(buildUrl(name)) preserves route name",
      (name) => {
        const url = router.buildUrl(name);
        const state = router.matchUrl(url);

        expect(state?.name).toBe(name);
      },
    );

    test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
      "matchUrl(buildUrl(name, params)) preserves params.id",
      (params) => {
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(url);

        expect(state?.name).toBe(PARAM_ROUTE_NAME);
        expect(state?.params.id).toBe(params.id);
      },
    );

    test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
      "buildUrl is deterministic — same inputs produce same URL",
      (params) => {
        const url1 = router.buildUrl(PARAM_ROUTE_NAME, params);
        const url2 = router.buildUrl(PARAM_ROUTE_NAME, params);

        expect(url1).toBe(url2);
      },
    );
  });

  describe("URL Roundtrip (URL-unsafe characters)", () => {
    const router = createPluginRouter("");

    test.prop([arbUnsafeIdParam], { numRuns: NUM_RUNS.standard })(
      "if matchUrl succeeds, params.id is preserved exactly",
      (params) => {
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(url);

        fc.pre(state !== undefined);

        expect(state.name).toBe(PARAM_ROUTE_NAME);
        expect(state.params.id).toBe(params.id);
      },
    );
  });

  describe("Base Path Inclusion", () => {
    test.prop([arbNormalizedBase, arbLeafRoute], { numRuns: NUM_RUNS.fast })(
      "buildUrl with any normalized base always starts with that base",
      (base, name) => {
        const router = createPluginRouter(base);
        const url = router.buildUrl(name);

        if (base.length > 0) {
          expect(url.startsWith(base)).toBe(true);
        }

        const pathAfterBase = url.slice(base.length);

        // Tail is either "/<segments>" (non-index routes) or "" —
        // the empty case is `buildUrl("/", "/app") === "/app"` after the
        // canonical-base fix that collapses index-under-base to the base
        // without a trailing slash. Roundtrip holds:
        // `extractPath("/app", "/app") === "/"`.
        expect(pathAfterBase === "" || pathAfterBase.startsWith("/")).toBe(
          true,
        );
      },
    );
  });

  describe("Base Path Roundtrip", () => {
    test.prop([arbNormalizedBase, arbLeafRoute], { numRuns: NUM_RUNS.fast })(
      "matchUrl(buildUrl(name)) returns correct name for any normalized base",
      (base, name) => {
        const router = createPluginRouter(base);
        const url = router.buildUrl(name);
        const state = router.matchUrl(url);

        expect(state?.name).toBe(name);
      },
    );

    test.prop([fc.constantFrom("/app", "/sub", "/nested/base"), arbIdParam], {
      numRuns: NUM_RUNS.fast,
    })(
      "matchUrl(buildUrl(name, params)) preserves params for non-empty base",
      (base, params) => {
        const router = createPluginRouter(base);
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(url);

        expect(state?.name).toBe(PARAM_ROUTE_NAME);
        expect(state?.params.id).toBe(params.id);
      },
    );
  });

  describe("Trailing Slash Normalization", () => {
    test.prop([arbBaseSegment, arbLeafRoute], { numRuns: NUM_RUNS.fast })(
      "trailing slash in base has no effect on output",
      (baseWithoutSlash, name) => {
        const routerNormalized = createPluginRouter(baseWithoutSlash);
        const routerWithSlash = createPluginRouter(`${baseWithoutSlash}/`);

        const urlNormalized = routerNormalized.buildUrl(name);
        const urlWithSlash = routerWithSlash.buildUrl(name);

        expect(urlWithSlash).toStrictEqual(urlNormalized);
      },
    );

    test.prop([arbBaseSegment, arbLeafRoute], { numRuns: NUM_RUNS.fast })(
      "URL built with trailing-slash base never contains double slashes",
      (baseWithoutSlash, name) => {
        const router = createPluginRouter(`${baseWithoutSlash}/`);
        const url = router.buildUrl(name);

        expect(url).not.toContain("//");
      },
    );
  });

  describe("Query String Resilience", () => {
    const router = createPluginRouter("");

    test.prop([arbLeafRoute, arbQueryString], { numRuns: NUM_RUNS.standard })(
      "arbitrary query strings do not break route name resolution",
      (name, qs) => {
        const url = router.buildUrl(name);
        const state = router.matchUrl(`${url}?${qs}`);

        expect(state?.name).toBe(name);
      },
    );

    test.prop([arbIdParam, arbQueryString], { numRuns: NUM_RUNS.standard })(
      "query strings do not break parameterized route resolution",
      (params, qs) => {
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(`${url}?${qs}`);

        expect(state?.name).toBe(PARAM_ROUTE_NAME);
        expect(state?.params.id).toBe(params.id);
      },
    );
  });

  describe("Path Extraction", () => {
    test.prop(
      [arbUrlPath, fc.constantFrom("", "/app", "/sub", "/nested/base")],
      {
        numRuns: NUM_RUNS.standard,
      },
    )("extractPath(base + path, base) always starts with /", (path, base) => {
      const fullPathname = base + path;
      const result = extractPath(fullPathname, base);

      expect(result.startsWith("/")).toBe(true);
    });

    test.prop([fc.constantFrom("", "/app", "/nested/base")], {
      numRuns: NUM_RUNS.fast,
    })("extractPath(base, base) returns / (empty stripped path)", (base) => {
      fc.pre(base.length > 0);

      const result = extractPath(base, base);

      expect(result).toBe("/");
    });

    test.prop([arbUrlPath, fc.constantFrom("/other", "/different/base")], {
      numRuns: NUM_RUNS.standard,
    })(
      "extractPath returns pathname unchanged when it does not start with base",
      (path, base) => {
        const result = extractPath(path, base);

        expect(result).toStrictEqual(path);
      },
    );

    test.prop(
      [
        fc
          .tuple(
            fc.stringMatching(/^\/[a-z]{1,4}$/),
            fc.stringMatching(/^[a-z]{1,6}$/),
          )
          .map(([base, suffix]) => ({
            base,
            pathname: `${base}${suffix}/page`,
          })),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "extractPath never strips a partial segment prefix (#446)",
      ({ base, pathname }) => {
        const result = extractPath(pathname, base);

        expect(result).toBe(pathname);
      },
    );
  });

  describe("matchUrl — non-matching URLs", () => {
    const router = createPluginRouter("");

    test.prop([arbNonMatchingPath], { numRuns: NUM_RUNS.standard })(
      "matchUrl returns undefined for URLs that do not match any route",
      (path) => {
        const state = router.matchUrl(path);

        expect(state).toBeUndefined();
      },
    );
  });

  describe("Pure helpers — math invariants", () => {
    describe("safeParseUrl", () => {
      test.prop([fc.string({ minLength: 0, maxLength: 200 })], {
        numRuns: 2000,
      })(
        "is total: never throws and returns string-typed fields for any input",
        (url) => {
          const r = safeParseUrl(url);

          expect(typeof r.pathname).toBe("string");
          expect(typeof r.search).toBe("string");
          expect(typeof r.hash).toBe("string");
        },
      );

      test.prop(
        [fc.stringMatching(/^\/[a-z]{0,6}(\?[a-z=&]{0,8})?(#[a-z]{0,6})?$/)],
        { numRuns: 500 },
      )("pathname + search + hash === input for scheme-less paths", (url) => {
        const { pathname, search, hash } = safeParseUrl(url);

        expect(pathname + search + hash).toBe(url);
      });
    });

    describe("extractPath", () => {
      test.prop([arbUrlPath], { numRuns: 500 })(
        "is idempotent with empty base",
        (p) => {
          expect(extractPath(extractPath(p, ""), "")).toBe(extractPath(p, ""));
        },
      );
    });

    describe("buildUrl", () => {
      test.prop(
        [
          fc
            .stringMatching(/^\/[a-z0-9/]{0,20}$/)
            .filter((p) => !p.endsWith("/") || p === "/"),
          arbNormalizedBase,
        ],
        { numRuns: 500 },
      )(
        "always produces a URL that starts with base (or '/' when base empty)",
        (path, base) => {
          const url = buildUrl(path, base);

          if (base.length > 0) {
            expect(url.startsWith(base)).toBe(true);
          } else {
            expect(url.startsWith("/")).toBe(true);
          }
        },
      );

      test.prop([arbUrlPath, arbNormalizedBase], { numRuns: 500 })(
        "composition: extractPath(buildUrl(path, base), base) === path for leading-slash paths",
        (path, base) => {
          fc.pre(path.startsWith("/"));

          expect(extractPath(buildUrl(path, base), base)).toBe(path);
        },
      );
    });

    describe("normalizeBase", () => {
      test.prop([fc.string({ minLength: 0, maxLength: 50 })], { numRuns: 500 })(
        "is idempotent: normalizeBase(normalizeBase(x)) === normalizeBase(x)",
        (x) => {
          const once = normalizeBase(x);

          expect(normalizeBase(once)).toBe(once);
        },
      );

      test.prop([fc.string({ minLength: 0, maxLength: 50 })], { numRuns: 500 })(
        "produces canonical form: empty OR leading slash, no trailing slash, no '//' runs",
        (x) => {
          const r = normalizeBase(x);

          if (r === "") {
            return;
          }

          expect(r.startsWith("/")).toBe(true);
          expect(r.endsWith("/")).toBe(false);
          expect(r).not.toContain("//");
        },
      );
    });

    describe("shouldReplaceHistory — truth table", () => {
      const arbNavOptions: fc.Arbitrary<NavigationOptions> = fc.record(
        {
          replace: fc.option(fc.boolean(), { nil: undefined }),
          reload: fc.option(fc.boolean(), { nil: undefined }),
        },
        { requiredKeys: [] },
      );

      const arbStubState: fc.Arbitrary<State> = fc.constantFrom("/a", "/b").map(
        (path) =>
          ({
            path,
            name: "stub",
            params: {},
            transition: undefined,
            context: {},
          }) as unknown as State,
      );

      test.prop(
        [
          arbNavOptions,
          arbStubState,
          fc.option(arbStubState, { nil: undefined }),
        ],
        { numRuns: 1000 },
      )(
        "matches the specification: replace===true, or !fromState and replace!==false, or reload+same path",
        (navOptions, toState, fromState) => {
          const actual = shouldReplaceHistory(navOptions, toState, fromState);

          let expected: boolean;

          if (navOptions.replace === true) {
            expected = true;
          } else if (fromState) {
            expected = !!navOptions.reload && toState.path === fromState.path;
          } else {
            expected = navOptions.replace !== false;
          }

          expect(actual).toBe(expected);
        },
      );
    });
  });

  describe("getRouteFromEvent (via popstate)", () => {
    test.prop([arbLeafRoute], { numRuns: NUM_RUNS.fast })(
      "popstate with isState-valid history.state restores the expected route",
      async (name) => {
        const router = createPluginRouter("");

        try {
          await router.start();

          const validHistoryState = {
            name,
            params: {},
            path: router.buildPath(name),
          };

          globalThis.dispatchEvent(
            new PopStateEvent("popstate", { state: validHistoryState }),
          );

          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(router.getState()?.name).toBe(name);
        } finally {
          router.stop();
        }
      },
    );

    test.prop([arbIdParam], { numRuns: NUM_RUNS.fast })(
      "popstate with parameterized history.state passes params through unchanged",
      async (params) => {
        const router = createPluginRouter("");

        try {
          await router.start();

          const validHistoryState = {
            name: PARAM_ROUTE_NAME,
            params,
            path: router.buildPath(PARAM_ROUTE_NAME, params),
          };

          globalThis.dispatchEvent(
            new PopStateEvent("popstate", { state: validHistoryState }),
          );

          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(router.getState()?.name).toBe(PARAM_ROUTE_NAME);
          expect(router.getState()?.params.id).toBe(params.id);
        } finally {
          router.stop();
        }
      },
    );
  });
});
