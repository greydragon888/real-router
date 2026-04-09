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
import { extractPath } from "../../src/url-utils";

describe("Navigation Plugin URL Invariants", () => {
  describe("URL Roundtrip (no base)", () => {
    const router = createPluginRouter("");

    test.prop([arbLeafRoute], { numRuns: NUM_RUNS.standard })(
      "matchUrl(buildUrl(name)) preserves route name",
      (name) => {
        const url = router.buildUrl(name);
        const state = router.matchUrl(url);

        expect(state).toBeDefined();
        expect(state!.name).toBe(name);
      },
    );

    test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
      "matchUrl(buildUrl(name, params)) preserves params.id",
      (params) => {
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(url);

        expect(state).toBeDefined();
        expect(state!.name).toBe(PARAM_ROUTE_NAME);
        expect(state!.params.id).toBe(params.id);
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

        expect(pathAfterBase.startsWith("/")).toBe(true);
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

        expect(state).toBeDefined();
        expect(state!.name).toBe(name);
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

        expect(state).toBeDefined();
        expect(state!.name).toBe(PARAM_ROUTE_NAME);
        expect(state!.params.id).toBe(params.id);
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

        expect(state).toBeDefined();
        expect(state!.name).toBe(name);
      },
    );

    test.prop([arbIdParam, arbQueryString], { numRuns: NUM_RUNS.standard })(
      "query strings do not break parameterized route resolution",
      (params, qs) => {
        const url = router.buildUrl(PARAM_ROUTE_NAME, params);
        const state = router.matchUrl(`${url}?${qs}`);

        expect(state).toBeDefined();
        expect(state!.name).toBe(PARAM_ROUTE_NAME);
        expect(state!.params.id).toBe(params.id);
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
});
