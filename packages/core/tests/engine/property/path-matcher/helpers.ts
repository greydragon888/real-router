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

import { buildParamMeta } from "../../../../src/engine/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../../../src/engine/path-matcher/SegmentMatcher";
import type {
  MatcherInputNode,
  SegmentMatcherOptions,
  URLParamsEncodingType,
} from "../../../../src/engine/path-matcher/types";

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
  options?: Partial<SegmentMatcherOptions>,
): SegmentMatcher {
  const matcher = createTestMatcher(options);

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
 * Matcher with a splat param route.
 *
 * Tree: root > files(/files/*path)
 * Routes: "files"
 * Splat captures everything after /files/
 */
export function createSplatMatcher(
  options?: Partial<SegmentMatcherOptions>,
): SegmentMatcher {
  const matcher = createTestMatcher(options);

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
  options?: Partial<SegmentMatcherOptions>,
): SegmentMatcher {
  const matcher = createTestMatcher(options);

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
  options?: Partial<SegmentMatcherOptions>,
): SegmentMatcher {
  const matcher = createTestMatcher(options);

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
 * A single path-segment value (no "/") that EVERY non-identity strategy must
 * transform — it always contains a space or a multibyte char, which `default`,
 * `uri`, and `uriComponent` all percent-encode. Unlike `arbSafeParamValue` (a
 * fixpoint of all four encoders), this distinguishes a real encoder from an
 * identity stub, so a roundtrip test can add an anti-identity assertion that a
 * permissive decode-oracle cannot otherwise catch (PBT audit).
 */
export const arbEncodableValue: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z0-9 é€中]{1,12}$/u)
  .filter((s) => /[ é€中]/u.test(s));

/**
 * Splat value whose segments are individually encode-requiring (each is an
 * `arbEncodableValue`), joined by "/". Forces real per-segment encoding so the
 * splat roundtrip is non-trivial (vs `arbSplatValue`, an encoder fixpoint).
 */
export const arbEncodableSplatValue: fc.Arbitrary<string> = fc
  .array(arbEncodableValue, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("/"));

/**
 * A value that every non-identity strategy percent-encodes (it always contains a
 * space → `%20`) yet whose RAW form still survives `match()` in a single path
 * segment — no "/", "#", "?", "%", control, or Unicode, and clean non-space
 * boundaries. This is the one class that round-trips through build→match under
 * ALL four strategies (incl. `none`, which keeps the space raw and the matcher
 * accepts it) while still distinguishing a real encoder from an identity stub:
 * the URL contains a space under `none` and `%20` under the rest. Use it to give
 * a build→match-through-the-matcher test anti-identity teeth (vs
 * `arbSafeParamValue`, an encoder fixpoint).
 */
export const arbMatchSafeEncodableValue: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{0,10}[a-zA-Z0-9]$/)
  .filter((s) => s.includes(" "));

/** Splat counterpart of {@link arbMatchSafeEncodableValue}: space-bearing
 * match-safe segments joined by "/". */
export const arbMatchSafeEncodableSplatValue: fc.Arbitrary<string> = fc
  .array(arbMatchSafeEncodableValue, { minLength: 1, maxLength: 3 })
  .map((segments) => segments.join("/"));

/**
 * Arbitrary string covering the full Unicode range for pure encoding-function
 * tests. fast-check v4's bare `fc.string()` emits printable ASCII only
 * (0x20–0x7E); `unit: "grapheme"` is what actually exercises the multibyte/emoji
 * path the encoders' `u`-flag exists to handle — valid clusters, no lone
 * surrogates (so `encodeURIComponent` never throws on this generator).
 */
export const arbUnicodeString: fc.Arbitrary<string> = fc.string({
  unit: "grapheme",
  maxLength: 30,
});
