import { fc, test } from "@fast-check/vitest";

import {
  arbHashPrefix,
  arbRegexSpecialPrefix,
  arbSimpleRouteName,
  arbParamValue,
  arbUnsafeIdParam,
  arbBase,
  createHashRouter,
  NUM_RUNS,
} from "./helpers";
import { createHashPrefixRegex, extractHashPath } from "../../src/hash-utils";

// =============================================================================
// Roundtrip: matchUrl(buildUrl(name, params)) returns original route
// =============================================================================

describe("roundtrip: matchUrl(buildUrl(name)) returns original route", () => {
  test.prop([arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "route name is preserved through buildUrl → matchUrl",
    (hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl(routeName, {});
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.name).toStrictEqual(routeName);

      router.stop();
    },
  );

  test.prop([arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "path in state matches buildPath output",
    (hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl(routeName, {});
      const expectedPath = router.buildPath(routeName, {});
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.path).toStrictEqual(expectedPath);

      router.stop();
    },
  );
});

// =============================================================================
// Prefix: buildUrl always includes hash prefix
// =============================================================================

describe("prefix: buildUrl includes hash prefix", () => {
  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  test.prop([arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "buildUrl output contains `#${prefix}`",
    (hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl(routeName, {});

      expect(url).toContain(`#${hashPrefix}`);

      router.stop();
    },
  );

  test.prop([arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "buildUrl output starts with `#${prefix}/`",
    (hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl(routeName, {});

      expect(url.startsWith(`#${hashPrefix}/`)).toBe(true);

      router.stop();
    },
  );
});

// =============================================================================
// Prefix Stripping: matchUrl strips hash prefix and finds route
// =============================================================================

describe("prefix stripping: matchUrl correctly strips hash prefix", () => {
  test.prop([arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "matchUrl returns defined state for URL built with same prefix",
    (hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl(routeName, {});
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();

      router.stop();
    },
  );

  test.prop([arbHashPrefix], { numRuns: NUM_RUNS.standard })(
    "matchUrl with non-matching prefix returns undefined",
    (hashPrefix: string) => {
      const router = createHashRouter(hashPrefix);
      const wrongPrefix = hashPrefix === "!" ? "~" : "!";
      const url = `https://example.com/#${wrongPrefix}/home`;
      const state = router.matchUrl(url);

      expect(state).toBeUndefined();

      router.stop();
    },
  );
});

// =============================================================================
// Regex Escape: createHashPrefixRegex correctly escapes special chars
// =============================================================================

describe("regex-escape: createHashPrefixRegex escapes regex special chars", () => {
  test.prop([arbRegexSpecialPrefix], { numRuns: NUM_RUNS.thorough })(
    "regex matches hash+prefix literal (not as regex metacharacter)",
    (prefix: string) => {
      const regex = createHashPrefixRegex(prefix);

      expect(regex).not.toBeNull();
      expect(regex!.test(`#${prefix}`)).toBe(true);
      expect(regex!.test(`#${prefix}/some/path`)).toBe(true);
    },
  );

  test.prop([arbRegexSpecialPrefix], { numRuns: NUM_RUNS.thorough })(
    "regex does not match hash with a different literal character",
    (prefix: string) => {
      const regex = createHashPrefixRegex(prefix);
      const differentChar = prefix === "." ? "x" : ".";
      const hashWithDifferent = `#${differentChar}`;

      expect(regex).not.toBeNull();
      expect(regex!.test(hashWithDifferent)).toBe(false);
    },
  );

  test.prop([arbRegexSpecialPrefix], { numRuns: NUM_RUNS.thorough })(
    "regex does not match a hash-only string (no prefix)",
    (prefix: string) => {
      const regex = createHashPrefixRegex(prefix);

      expect(regex).not.toBeNull();
      expect(regex!.test("#")).toBe(false);
    },
  );
});

// =============================================================================
// Default Prefix: default prefix is "" — URLs start with `#/`
// =============================================================================

describe("default-prefix: default hashPrefix is empty string", () => {
  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "buildUrl with no prefix starts with `#/`",
    (routeName: string) => {
      const router = createHashRouter("");
      const url = router.buildUrl(routeName, {});

      expect(url.startsWith("#/")).toBe(true);
      expect(url.startsWith("#!/")).toBe(false);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "createHashPrefixRegex returns null for empty prefix",
    (_routeName: string) => {
      const regex = createHashPrefixRegex("");

      expect(regex).toBeNull();
    },
  );
});

// =============================================================================
// Encoding: query params roundtrip through buildUrl → matchUrl
// =============================================================================

describe("encoding: path params correctly encode and decode through URL", () => {
  test.prop([arbHashPrefix, arbParamValue], { numRuns: NUM_RUNS.standard })(
    "path param id is preserved after buildUrl → matchUrl roundtrip",
    (hashPrefix: string, idValue: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl("users.view", { id: idValue });
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.params.id).toStrictEqual(idValue);

      router.stop();
    },
  );

  test.prop([arbHashPrefix, arbParamValue], {
    numRuns: NUM_RUNS.standard,
  })(
    "path param value in URL matches buildPath output exactly",
    (hashPrefix: string, idValue: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl("users.view", { id: idValue });
      const state = router.matchUrl(`https://example.com${url}`);
      const expectedPath = router.buildPath("users.view", { id: idValue });

      expect(state).toBeDefined();
      expect(state!.path).toStrictEqual(expectedPath);

      router.stop();
    },
  );
});

// =============================================================================
// Encoding: URL-unsafe chars survive buildUrl → matchUrl roundtrip
// =============================================================================

describe("unsafe-encoding: URL-unsafe characters roundtrip through hash URL", () => {
  test.prop([arbHashPrefix, arbUnsafeIdParam], {
    numRuns: NUM_RUNS.standard,
  })(
    "arbitrary string id is preserved after buildUrl → matchUrl roundtrip",
    (hashPrefix: string, idValue: string) => {
      const router = createHashRouter(hashPrefix);
      const url = router.buildUrl("users.view", { id: idValue });
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.name).toBe("users.view");
      expect(state!.params.id).toStrictEqual(idValue);

      router.stop();
    },
  );
});

// =============================================================================
// Base: base option prepends path before hash
// =============================================================================

describe("base: base option is prepended before hash in buildUrl", () => {
  test.prop([arbBase, arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "buildUrl output starts with `${base}#${prefix}/`",
    (base: string, hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix, base);
      const url = router.buildUrl(routeName, {});

      expect(url.startsWith(`${base}#${hashPrefix}/`)).toBe(true);

      router.stop();
    },
  );

  test.prop([arbBase, arbHashPrefix, arbSimpleRouteName], {
    numRuns: NUM_RUNS.standard,
  })(
    "buildUrl → matchUrl roundtrip works with base",
    (base: string, hashPrefix: string, routeName: string) => {
      const router = createHashRouter(hashPrefix, base);
      const url = router.buildUrl(routeName, {});
      const state = router.matchUrl(`https://example.com${url}`);

      expect(state).toBeDefined();
      expect(state!.name).toBe(routeName);

      router.stop();
    },
  );
});

// =============================================================================
// Empty-hash fallback: extractHashPath returns "/" for prefix-only hash
// =============================================================================

describe("empty-hash fallback: extractHashPath returns '/' when hash has no path", () => {
  test.prop([arbRegexSpecialPrefix], { numRuns: NUM_RUNS.thorough })(
    "hash with prefix only (no path) yields '/'",
    (prefix: string) => {
      const regex = createHashPrefixRegex(prefix);
      const path = extractHashPath(`#${prefix}`, regex);

      expect(path).toBe("/");
    },
  );

  test.prop([arbHashPrefix], { numRuns: NUM_RUNS.standard })(
    "bare '#' with null regex yields '/'",
    (_prefix: string) => {
      const path = extractHashPath("#", null);

      expect(path).toBe("/");
    },
  );
});

// =============================================================================
// Search Params: query params survive buildUrl → matchUrl roundtrip
// =============================================================================

describe("search-params: query params preserved through hash URL matchUrl", () => {
  test.prop(
    [
      arbHashPrefix,
      fc.constantFrom("1", "10", "42"),
      fc.constantFrom("asc", "desc", "name"),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "search params in hash URL are parsed correctly by matchUrl",
    (hashPrefix: string, page: string, sort: string) => {
      const router = createHashRouter(hashPrefix);

      // Build the base URL and manually append query params
      // (queryParamsMode: "default" allows undeclared query params in matchUrl)
      const baseUrl = router.buildUrl("users.list", {});
      const urlWithParams = `https://example.com${baseUrl}?page=${page}&sort=${sort}`;
      const state = router.matchUrl(urlWithParams);

      expect(state).toBeDefined();
      expect(state!.name).toBe("users.list");
      // queryParamsMode: "default" auto-converts numeric strings to numbers
      expect(String(state!.params.page as number)).toBe(page);
      expect(state!.params.sort).toBe(sort);

      router.stop();
    },
  );
});

// =============================================================================
// Rejection: matchUrl returns undefined for unparseable URLs
// =============================================================================

describe("rejection: matchUrl returns undefined for unmatched hash path", () => {
  test.prop([arbHashPrefix], { numRuns: NUM_RUNS.standard })(
    "matchUrl returns undefined when hash path matches no route",
    (hashPrefix: string) => {
      const router = createHashRouter(hashPrefix);
      const url = `https://example.com/#${hashPrefix}/this/route/does/not/exist`;
      const state = router.matchUrl(url);

      expect(state).toBeUndefined();

      router.stop();
    },
  );
});
