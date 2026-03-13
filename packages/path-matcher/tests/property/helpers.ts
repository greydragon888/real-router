// packages/path-matcher/tests/property/helpers.ts

/**
 * Shared helpers for path-matcher property-based tests.
 *
 * Provides:
 * - Route tree builder utilities (createInputNode, createRootWithChildren)
 * - Pre-built matcher factories for different test scenarios
 * - fast-check arbitraries for param values, encoding types, etc.
 */

import { fc } from "@fast-check/vitest";

import { buildParamMeta } from "../../src/buildParamMeta";
import { SegmentMatcher } from "../../src/SegmentMatcher";

import type {
  MatcherInputNode,
  SegmentMatcherOptions,
  URLParamsEncodingType,
} from "../../src/types";

// =============================================================================
// Constants
// =============================================================================

export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;

// =============================================================================
// Route Tree Builder Helpers
// =============================================================================

/**
 * Create a MatcherInputNode from partial overrides.
 * Follows the same pattern as unit tests — auto-derives paramMeta from path.
 */
export function createInputNode(
  overrides: Partial<MatcherInputNode> & { name: string; path: string },
): MatcherInputNode {
  const paramMeta = buildParamMeta(overrides.path);

  return {
    fullName: overrides.name,
    absolute: false,
    children: new Map<string, MatcherInputNode>(),
    nonAbsoluteChildren: [],
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    staticPath: paramMeta.urlParams.length === 0 ? overrides.path : null,
    ...overrides,
  };
}

/**
 * Wrap a list of top-level nodes into a root container node (fullName = "").
 */
export function createRootWithChildren(
  children: MatcherInputNode[],
): MatcherInputNode {
  return createInputNode({
    name: "",
    path: "",
    fullName: "",
    children: new Map(children.map((c) => [c.name, c])),
    nonAbsoluteChildren: children,
  });
}

// =============================================================================
// Matcher Factories
// =============================================================================

/**
 * Matcher with a single param route.
 *
 * Tree: root > users(/users) > profile(/:id)
 * Routes: "users", "users.profile"
 */
export function createParamMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const profileNode = createInputNode({
    name: "profile",
    path: "/:id",
    fullName: "users.profile",
  });

  const usersNode = createInputNode({
    name: "users",
    path: "/users",
    fullName: "users",
    children: new Map([["profile", profileNode]]),
    nonAbsoluteChildren: [profileNode],
  });

  matcher.registerTree(createRootWithChildren([usersNode]));

  return matcher;
}

/**
 * Matcher with a constrained param route.
 *
 * Tree: root > users(/users) > profile(/:id<\d+>)
 * Routes: "users", "users.profile"
 * Constraint: id must match \d+
 */
export function createConstrainedMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const profileNode = createInputNode({
    name: "profile",
    path: String.raw`/:id<\d+>`,
    fullName: "users.profile",
  });

  const usersNode = createInputNode({
    name: "users",
    path: "/users",
    fullName: "users",
    children: new Map([["profile", profileNode]]),
    nonAbsoluteChildren: [profileNode],
  });

  matcher.registerTree(createRootWithChildren([usersNode]));

  return matcher;
}

/**
 * Matcher with an optional param route.
 *
 * Tree: root > search(/search/:query?)
 * Routes: "search"
 * Matches both /search and /search/:query
 */
export function createOptionalParamMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const searchNode = createInputNode({
    name: "search",
    path: "/search/:query?",
    fullName: "search",
  });

  matcher.registerTree(createRootWithChildren([searchNode]));

  return matcher;
}

/**
 * Matcher with a splat param route.
 *
 * Tree: root > files(/files/*path)
 * Routes: "files"
 * Splat captures everything after /files/
 */
export function createSplatMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const filesNode = createInputNode({
    name: "files",
    path: "/files/*path",
    fullName: "files",
  });

  matcher.registerTree(createRootWithChildren([filesNode]));

  return matcher;
}

/**
 * Matcher with static + param at the same level (priority test).
 *
 * Tree: root > users(/users) > new(/new) [static], profile(/:id) [param]
 * Routes: "users", "users.new", "users.profile"
 * Priority: /users/new → users.new (static wins over param)
 */
export function createStaticParamPriorityMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const newNode = createInputNode({
    name: "new",
    path: "/new",
    fullName: "users.new",
  });

  const profileNode = createInputNode({
    name: "profile",
    path: "/:id",
    fullName: "users.profile",
  });

  const usersNode = createInputNode({
    name: "users",
    path: "/users",
    fullName: "users",
    children: new Map([
      ["new", newNode],
      ["profile", profileNode],
    ]),
    nonAbsoluteChildren: [newNode, profileNode],
  });

  matcher.registerTree(createRootWithChildren([usersNode]));

  return matcher;
}

/**
 * Matcher with param + splat at the same level (priority test).
 *
 * Tree: root > items(/items) > specific(/:id) [param], all(*rest) [splat]
 * Routes: "items", "items.specific", "items.all"
 * Priority: /items/hello → items.specific (param wins over splat for single segment)
 */
export function createParamSplatMatcher(
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const matcher = new SegmentMatcher(options);

  const specificNode = createInputNode({
    name: "specific",
    path: "/:id",
    fullName: "items.specific",
  });

  const allNode = createInputNode({
    name: "all",
    path: "/*rest",
    fullName: "items.all",
  });

  const itemsNode = createInputNode({
    name: "items",
    path: "/items",
    fullName: "items",
    children: new Map([
      ["specific", specificNode],
      ["all", allNode],
    ]),
    nonAbsoluteChildren: [specificNode, allNode],
  });

  matcher.registerTree(createRootWithChildren([itemsNode]));

  return matcher;
}

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

/**
 * Any URLParamsEncodingType value.
 */
export const arbEncoding: fc.Arbitrary<URLParamsEncodingType> = fc.constantFrom(
  "default",
  "uri",
  "uriComponent",
  "none",
);

/**
 * URL-safe param value: alphanumeric + hyphen/underscore/tilde/dot.
 * Safe for ALL encoding types in URL paths — no chars that encodeURI skips.
 */
export const arbSafeParamValue: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9_\-.~]{1,15}$/,
);

/**
 * Splat param value: segments separated by "/" like "docs/readme" or "a/b/c".
 * Each segment is alphanumeric-safe.
 */
export const arbSplatValue: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9_\-.]{1,10}$/), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => segments.join("/"));

/**
 * Numeric string satisfying \d+ constraint.
 */
export const arbNumericParam: fc.Arbitrary<string> =
  fc.stringMatching(/^\d{1,10}$/);

/**
 * Non-numeric (letters-only) string — violates \d+ constraint.
 */
export const arbNonNumericParam: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-zA-Z]{1,10}$/);

/**
 * Arbitrary Unicode string for pure encoding function tests.
 * fast-check generates valid Unicode (no lone surrogates).
 */
export const arbUnicodeString: fc.Arbitrary<string> = fc.string({
  maxLength: 30,
});

/**
 * String consisting only of characters in the "safe" charset for default encoding.
 * NEEDS_ENCODING_TEST = /[^\w!$'()*+,.:;|~-]/u — chars NOT in this set need encoding.
 * These chars are already in the safe set and should pass through unchanged.
 */
export const arbSafeEncodingString: fc.Arbitrary<string> = fc.stringMatching(
  /^[\w!$'()*+,.:;|~-]*$/,
);
