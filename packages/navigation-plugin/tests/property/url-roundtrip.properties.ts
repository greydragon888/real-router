import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  PARAM_ROUTE_NAME,
  arbBaseSegment,
  arbDeepPath,
  arbIdParam,
  arbLeafRoute,
  arbNormalizedBase,
  arbRawBase,
  arbSpecialCharPath,
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
  safelyEncodePath,
  urlToPath,
} from "../../src/browser-env";

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

        // The tail is either "/<segments>" (non-index routes under base),
        // "/<segments>" (any route with empty base), or "" — the last case
        // is exclusively `buildUrl("/", "/app") === "/app"` after the
        // canonical-base fix: index-under-base collapses the trailing slash
        // to keep URLs symmetric with `normalizeBase`.
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

  describe("Primitive Function Invariants", () => {
    test.prop([arbUrlPath, arbNormalizedBase], { numRuns: NUM_RUNS.standard })(
      "extractPath(buildUrl(path, base), base) === path (primitive roundtrip)",
      (path, base) => {
        expect(extractPath(buildUrl(path, base), base)).toBe(path);
      },
    );

    test.prop([arbRawBase], { numRuns: NUM_RUNS.standard })(
      "normalizeBase is idempotent",
      (base) => {
        const once = normalizeBase(base);
        const twice = normalizeBase(once);

        expect(twice).toBe(once);
      },
    );

    test.prop([fc.stringMatching(/^\/[a-zA-Z0-9/._-]{0,30}$/)], {
      numRuns: NUM_RUNS.standard,
    })("safelyEncodePath is idempotent", (path) => {
      const once = safelyEncodePath(path);
      const twice = safelyEncodePath(once);

      expect(twice).toBe(once);
    });

    test.prop([arbRawBase], { numRuns: NUM_RUNS.standard })(
      "G5: normalizeBase of non-empty input starts with /",
      (base) => {
        const result = normalizeBase(base);

        fc.pre(result.length > 0);

        expect(result.startsWith("/")).toBe(true);
      },
    );

    test.prop([arbRawBase], { numRuns: NUM_RUNS.standard })(
      "G5: normalizeBase of non-empty input does not end with /",
      (base) => {
        const result = normalizeBase(base);

        fc.pre(result.length > 0);

        expect(result.endsWith("/")).toBe(false);
      },
    );

    test.prop([arbRawBase], { numRuns: NUM_RUNS.standard })(
      "G5: normalizeBase never contains runs of // anywhere",
      (base) => {
        const result = normalizeBase(base);

        expect(result).not.toMatch(/\/{2,}/);
      },
    );
  });

  // Coverage for pathological / unusual inputs — deeper paths than
  // arbUrlPath produces, and paths with special characters the matcher
  // must tolerate without crashing. The matcher itself usually fails
  // to resolve these (they don't match fixture routes), but the URL
  // utilities and safeParseUrl must stay total.
  describe("Deep Paths and Special-Character Segments", () => {
    test.prop([arbDeepPath, arbNormalizedBase], { numRuns: NUM_RUNS.fast })(
      "extractPath(buildUrl(deepPath, base), base) === deepPath (roundtrip holds at 4–8 segments)",
      (path, base) => {
        expect(extractPath(buildUrl(path, base), base)).toBe(path);
      },
    );

    test.prop([arbSpecialCharPath, arbNormalizedBase], {
      numRuns: NUM_RUNS.fast,
    })(
      "extractPath never throws for paths with uppercase / dots / %-encoding",
      (path, base) => {
        expect(() => extractPath(path, base)).not.toThrow();
      },
    );

    test.prop([arbSpecialCharPath, arbNormalizedBase], {
      numRuns: NUM_RUNS.fast,
    })(
      "buildUrl never throws for paths with uppercase / dots / %-encoding",
      (path, base) => {
        expect(() => buildUrl(path, base)).not.toThrow();
      },
    );

    test.prop([arbSpecialCharPath, arbNormalizedBase], {
      numRuns: NUM_RUNS.fast,
    })(
      "urlToPath on a scheme-less special-char path returns a string starting with /",
      (path, base) => {
        const result = urlToPath(path, base);

        expect(typeof result).toBe("string");
        expect(result.startsWith("/")).toBe(true);
      },
    );
  });
});
