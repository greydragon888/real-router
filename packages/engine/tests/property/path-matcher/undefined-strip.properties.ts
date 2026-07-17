import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { SegmentMatcher } from "../../../src/path-matcher/SegmentMatcher";

/**
 * Level 2 of the LAYERED `undefined`-strip contract (RFC 5.3 bis §5.3).
 *
 * **Where the strip actually lives (audit correction).** `SegmentMatcher.buildPath`
 * does NOT strip `undefined` query values itself — `#buildQueryStringForBuild`
 * copies the params object (undefined values included) straight to the injected
 * `buildQueryString`. The clean URL is produced by that engine
 * (production: `search-params`; here: the inline mirror in `createTestMatcher`,
 * which drops `undefined`). So the first three tests below verify a LAYERED
 * contract — the matcher faithfully delegates AND the engine strips — not a
 * matcher-owned guard. The fourth test is the negative witness that pins the
 * boundary: with a deliberately non-filtering engine, `buildPath` emits the value
 * verbatim, proving the matcher performs no strip of its own.
 *
 * These tests pair with:
 * - Level 1 invariants: `packages/core/tests/functional/navigation/navigate/query-params.test.ts`
 *   (describe "undefined params contract")
 * - Level 3 invariants: `packages/search-params/tests/functional/` (engine's
 *   own strip) + `packages/path-matcher/tests/unit/createTestMatcher.test.ts`
 *   (inline parser baseline)
 *
 * Together they close the RFC 5.3 bis "undefined-strip, layered" invariant.
 */

// =============================================================================
// Arbitraries
// =============================================================================

/**
 * A defined query param value (excludes `undefined`).
 */
const arbDefinedValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(""),
  fc.constant(0),
  fc.constant(false),
);

/**
 * A value that might be `undefined` (50% chance).
 */
const arbMaybeUndefined = fc.oneof(fc.constant(undefined), arbDefinedValue);

/**
 * Safe query-param key (alphanumeric, short).
 */
const arbParamKey = fc.stringMatching(/^[a-zA-Z]\w{0,7}$/);

/**
 * A params object where values may include `undefined`.
 */
const arbMixedParams = fc.dictionary(arbParamKey, arbMaybeUndefined, {
  maxKeys: 8,
});

// =============================================================================
// Route Setup — matcher declaring a route with 6 query params
// =============================================================================

function createQueryMatcher(): SegmentMatcher {
  const matcher = createTestMatcher();
  const viewNode = createInputNode({
    name: "view",
    path: "/view?a&b&c&d&e&f",
    fullName: "view",
  });

  matcher.registerTree(createRootWithChildren([viewNode]));

  return matcher;
}

// =============================================================================
// Level 2 invariants
// =============================================================================

describe("SegmentMatcher.buildPath — undefined-strip invariants (level 2)", () => {
  const matcher = createQueryMatcher();

  test.prop([arbMixedParams], { numRuns: NUM_RUNS.thorough })(
    "URL output never contains '=undefined' or literal 'undefined' for a query param",
    (params) => {
      const url = matcher.buildPath("view", params, {
        queryParamsMode: "loose",
      });

      // No `key=undefined` segment
      expect(url).not.toMatch(/=undefined(?:&|$)/);

      // No key-only segment named literally "undefined"
      expect(url).not.toMatch(/[?&]undefined(?:[&=]|$)/);
    },
  );

  test.prop([arbMixedParams], { numRuns: NUM_RUNS.standard })(
    "URL roundtrip: build→match recovers only defined keys from input",
    (params) => {
      const url = matcher.buildPath("view", params, {
        queryParamsMode: "loose",
      });

      const result = matcher.match(url);

      expect(result).toBeDefined();

      // All undefined keys must be absent in the matched params
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) {
          expect(result!.params).not.toHaveProperty(key);
        }
      }
    },
  );

  test.prop(
    [
      fc.record({
        defined: fc.dictionary(arbParamKey, arbDefinedValue, { maxKeys: 4 }),
        undefinedKeys: fc.array(arbParamKey, { maxLength: 4 }),
      }),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "buildPath output is identical whether undefined keys are present or absent",
    ({ defined, undefinedKeys }) => {
      const withUndefined: Record<string, unknown> = { ...defined };

      for (const k of undefinedKeys) {
        if (!(k in withUndefined)) {
          withUndefined[k] = undefined;
        }
      }

      const urlWith = matcher.buildPath("view", withUndefined, {
        queryParamsMode: "loose",
      });
      const urlWithout = matcher.buildPath("view", defined, {
        queryParamsMode: "loose",
      });

      expect(urlWith).toBe(urlWithout);
    },
  );
});

// =============================================================================
// Negative witness — the strip is engine-owned, not matcher-owned (#4 boundary)
// =============================================================================

/**
 * A `buildQueryString` that performs NO undefined-filtering: it renders every
 * key it is given, so an `undefined` value surfaces literally as `=undefined`.
 * This is exactly the engine the (now-corrected) "engine-independence" claim
 * assumed away. Used to prove that the clean URLs in the tests above come from
 * the engine's strip, not from `SegmentMatcher`.
 */
function noFilterBuildQueryString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

function createNoFilterMatcher(): SegmentMatcher {
  const matcher = createTestMatcher({
    buildQueryString: noFilterBuildQueryString,
  });
  const viewNode = createInputNode({
    name: "view",
    path: "/view?a&b",
    fullName: "view",
  });

  matcher.registerTree(createRootWithChildren([viewNode]));

  return matcher;
}

describe("SegmentMatcher.buildPath — strip is engine-owned (#4 boundary)", () => {
  // Defined value kept simple so the assertion targets the strip, not encoding.
  const arbSimpleValue = fc.stringMatching(/^[a-z0-9]{1,8}$/);

  test.prop([arbSimpleValue], { numRuns: NUM_RUNS.standard })(
    "with a non-filtering engine, buildPath emits `=undefined` verbatim (no matcher strip)",
    (definedVal) => {
      const matcher = createNoFilterMatcher();

      // `a` is undefined, `b` is defined — both DECLARED query params.
      const url = matcher.buildPath("view", { a: undefined, b: definedVal });

      // The matcher passed `a: undefined` through to the engine unchanged: had it
      // stripped undefined itself, `a=undefined` could never appear. (A mutation
      // adding a matcher-side strip makes this fail.) The three tests above cannot
      // catch such a mutation — their filtering engine drops undefined regardless.
      expect(url).toContain("a=undefined");

      // The defined declared value survives alongside it.
      expect(url).toContain(`b=${definedVal}`);
    },
  );
});
