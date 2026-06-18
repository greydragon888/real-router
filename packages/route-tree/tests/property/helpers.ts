// packages/route-tree/tests/property/helpers.ts

/**
 * Shared helpers for route-tree property-based tests.
 *
 * Provides:
 * - Pre-built matcher factories for different test scenarios
 * - Route tree builders for testing tree invariants
 * - fast-check arbitraries for param values, query values, etc.
 *
 * Strategy: a mix of (a) fixed route tree shapes with randomized input values
 * (for value-roundtrip and getSegmentsByName invariants), and (b) `arbRouteForest`
 * — a generator of random nested trees — for the STRUCTURE invariants (build
 * idempotency, immutability, nonAbsoluteChildren, fullName, normalization) so
 * they run over thousands of shapes rather than a handful of fixtures.
 */

import { fc } from "@fast-check/vitest";

import { createRouteTree } from "../../src/builder/createRouteTree";
import { createMatcher } from "../../src/createMatcher";

import type { QueryParamsConfig } from "../../src/createMatcher";
import type { RouteDefinition, RouteTree } from "../../src/types";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;

// =============================================================================
// Pre-built Route Trees (fixed shapes for property tests)
// =============================================================================

/**
 * Tree with URL param route.
 *
 * Structure: root > users(/users) > profile(/:id)
 * Routes: "users", "users.profile"
 */
export const PARAM_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
]);

/**
 * Tree with query-param-only route.
 *
 * Structure: root > search(/search?q&page)
 * Routes: "search"
 * Params: q (query), page (query)
 */
export const QUERY_TREE: RouteTree = createRouteTree("", "", [
  { name: "search", path: "/search?q&page" },
]);

/**
 * Tree with both URL params and query params on the same route.
 *
 * Structure: root > results(/results/:category?q)
 * Routes: "results"
 * Params: category (url), q (query)
 */
export const MIXED_TREE: RouteTree = createRouteTree("", "", [
  { name: "results", path: "/results/:category?q" },
]);

/**
 * Tree for array query param testing.
 *
 * Structure: root > items(/items?tags)
 * Routes: "items"
 * Params: tags (query, expected to be an array)
 */
export const ARRAY_QUERY_TREE: RouteTree = createRouteTree("", "", [
  { name: "items", path: "/items?tags" },
]);

// =============================================================================
// Matcher Factories (pre-configured with trees)
// =============================================================================

/**
 * Matcher with URL param route.
 *
 * Tree: root > users(/users) > profile(/:id)
 * Routes: "users", "users.profile"
 */
export function createParamMatcher(): ReturnType<typeof createMatcher> {
  const matcher = createMatcher();

  matcher.registerTree(PARAM_TREE);

  return matcher;
}

/**
 * Matcher with query-param-only route.
 *
 * Tree: root > search(/search?q&page)
 * Routes: "search"
 */
export function createQueryMatcher(
  qpConfig?: QueryParamsConfig,
): ReturnType<typeof createMatcher> {
  const matcher = createMatcher(qpConfig ? { queryParams: qpConfig } : {});

  matcher.registerTree(QUERY_TREE);

  return matcher;
}

/**
 * Matcher with both URL params and query params.
 *
 * Tree: root > results(/results/:category?q)
 * Routes: "results"
 */
export function createMixedMatcher(
  qpConfig?: QueryParamsConfig,
): ReturnType<typeof createMatcher> {
  const matcher = createMatcher(qpConfig ? { queryParams: qpConfig } : {});

  matcher.registerTree(MIXED_TREE);

  return matcher;
}

/**
 * Matcher with splat param route.
 *
 * Tree: root > files(/files) > catchAll(/*path)
 * Routes: "files", "files.catchAll"
 */
export function createSplatMatcher(): ReturnType<typeof createMatcher> {
  const matcher = createMatcher();

  matcher.registerTree(SPLAT_TREE);

  return matcher;
}

/**
 * Matcher for array query param testing.
 *
 * Tree: root > items(/items?tags)
 * Routes: "items"
 *
 * @param arrayFormat - Array serialization format
 */
export function createArrayMatcher(
  arrayFormat: "none" | "brackets" | "index" | "comma",
): ReturnType<typeof createMatcher> {
  const matcher = createMatcher({
    queryParams: { arrayFormat, numberFormat: "none" },
  });
  const tree = createRouteTree("", "", [
    { name: "items", path: "/items?tags" },
  ]);

  matcher.registerTree(tree);

  return matcher;
}

/**
 * Tree with splat param route.
 *
 * Structure: root > files(/files) > catchAll(/*path)
 * Routes: "files", "files.catchAll"
 * Params: path (splat)
 */
export const SPLAT_TREE: RouteTree = createRouteTree("", "", [
  {
    name: "files",
    path: "/files",
    children: [{ name: "catchAll", path: "/*path" }],
  },
]);

export { getSegmentsByName } from "../../src/operations/query";

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

/**
 * `:param` value over the FULL valid domain — safe chars AND chars that REQUIRE
 * percent-encoding (`/ % # ? & = +`, space, unicode). buildPath must encode them
 * and match must decode them back, so this exercises the encode/decode inverse a
 * safe-only generator never reaches. Non-empty (an empty required param is
 * rejected by design, #740).
 */
export const arbAnyParamValue: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_\-.~]{1,15}$/),
  fc.constantFrom(
    "a/b",
    "a b",
    "a%b",
    "a#b",
    "a?b",
    "a&b=c",
    "中文",
    "a+b",
    "100%",
    "<x>",
    "a:b",
    "a=b",
  ),
  fc.string({ minLength: 1, maxLength: 12 }),
);

/**
 * Query param value over the FULL valid domain — safe chars AND query-special
 * chars (`& = + % # ?`, space, unicode) the serializer must encode and the parser
 * decode. A safe-only generator never exercises that inverse.
 */
export const arbAnyQueryValue: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_.-]{1,15}$/),
  fc.constantFrom(
    "a b",
    "a&b",
    "a=b",
    "a+b",
    "100%",
    "a#b",
    "a?b",
    "中文",
    "a/b",
    "<x>",
    "a;b",
    "a,b",
  ),
  fc.string({ minLength: 1, maxLength: 12 }),
);

/**
 * Safe query param name: valid identifier.
 */
export const arbQueryParamName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-zA-Z_]\w{0,10}$/);

/**
 * Array of 1–4 unique safe query param names.
 * Used for Q1 (extraction) and Q2 (separation) invariants.
 */
export const arbQueryParamNames: fc.Arbitrary<string[]> = fc
  .array(arbQueryParamName, { minLength: 1, maxLength: 4 })
  .filter(
    (names) => new Set(names).size === names.length, // enforce uniqueness
  );

/**
 * Splat param value: 1–4 NON-empty path segments joined by a single "/". Each
 * segment now spans the encoding class (`% # ? & =`, space, unicode) — buildPath
 * percent-encodes each segment and match decodes it. Segments never contain "/"
 * (the separator) nor are empty, so a degenerate "//" (which match never emits,
 * i.e. outside the splat-value domain) is excluded by construction, not to hide a
 * bug.
 */
export const arbSplatValue: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.stringMatching(/^[a-zA-Z0-9_\-.~]{1,10}$/),
      fc.constantFrom(
        "a b",
        "a%b",
        "a#b",
        "a?b",
        "a&b",
        "中文",
        "100%",
        "<x>",
        "a:b",
        "a=b",
      ),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => segments.join("/"));

/**
 * Array of 1–4 string items for array query param tests. Items span the encoding
 * class with value-only chars (space, `%`, unicode) — deliberately NOT the array
 * format separators (`,` for comma, `[` `]` for brackets), since an item equal to
 * its own format's separator is outside that format's roundtrippable domain.
 */
export const arbArrayItems: fc.Arbitrary<string[]> = fc.array(
  fc.oneof(
    fc.stringMatching(/^[a-zA-Z0-9_.-]{1,10}$/),
    fc.constantFrom("a b", "a%b", "100%", "中文", "x.y"),
  ),
  { minLength: 1, maxLength: 4 },
);

/**
 * All 4 array format values.
 */
export const arbArrayFormat: fc.Arbitrary<
  "none" | "brackets" | "index" | "comma"
> = fc.constantFrom("none", "brackets", "index", "comma");

// =============================================================================
// Generative tree structure (random shapes — complements the fixed fixtures)
// =============================================================================

/**
 * Per-node shape: which kind of param the path declares, whether it is absolute,
 * and its children. Names and unique ids are assigned later so the generator
 * never produces name/path collisions (which would silently last-write-wins in
 * the children Map and break preservation/idempotency assertions).
 */
interface TreeShape {
  absolute: boolean;
  paramShape: "plain" | "url" | "query" | "urlquery" | "splat";
  children: TreeShape[];
}

const arbParamShape: fc.Arbitrary<TreeShape["paramShape"]> = fc.constantFrom(
  "plain",
  "url",
  "query",
  "urlquery",
  "splat",
);

/**
 * Depth-bounded recursive shape generator. Depth is capped explicitly (instead
 * of via fc.letrec) so trees stay small enough for hundreds of build cycles.
 */
function arbShape(depth: number): fc.Arbitrary<TreeShape> {
  const children: fc.Arbitrary<TreeShape[]> =
    depth <= 0
      ? fc.constant([])
      : fc.array(arbShape(depth - 1), { minLength: 0, maxLength: 3 });

  return fc.record({
    absolute: fc.boolean(),
    paramShape: arbParamShape,
    children,
  });
}

/**
 * Generates a random VALID nested route forest (`RouteDefinition[]`) with:
 * - globally unique names (`n0`, `n1`, …) and base paths (`/s0`, `/s1`, …) — no
 *   collisions, so every node survives the children Map;
 * - param variety: plain, URL param (`/:p<id>`), query (`?q<id>`), both, or
 *   splat (`/*p<id>`) — exercises every `paramMeta` branch;
 * - absolute (`~`) flags at any level;
 * - nesting up to 3 levels deep, up to 4 roots.
 *
 * Use this to verify STRUCTURE invariants (idempotency, immutability,
 * nonAbsoluteChildren, fullName, normalization) over thousands of shapes instead
 * of the handful of hand-written fixtures.
 */
export const arbRouteForest: fc.Arbitrary<RouteDefinition[]> = fc
  .array(arbShape(3), { minLength: 1, maxLength: 4 })
  .map((shapes) => {
    let id = 0;

    const toDef = (shape: TreeShape): RouteDefinition => {
      const myId = id;

      id += 1;

      let path: string;

      switch (shape.paramShape) {
        case "url": {
          path = `/s${myId}/:p${myId}`;

          break;
        }
        case "query": {
          path = `/s${myId}?q${myId}`;

          break;
        }
        case "urlquery": {
          path = `/s${myId}/:p${myId}?q${myId}`;

          break;
        }
        case "splat": {
          path = `/s${myId}/*p${myId}`;

          break;
        }
        default: {
          path = `/s${myId}`;
        }
      }

      if (shape.absolute) {
        path = `~${path}`;
      }

      const def: RouteDefinition = { name: `n${myId}`, path };

      if (shape.children.length > 0) {
        def.children = shape.children.map((child) => toDef(child));
      }

      return def;
    };

    return shapes.map((shape) => toDef(shape));
  });
