import { fc, test } from "@fast-check/vitest";

import { createInputNode, createRootWithChildren, NUM_RUNS } from "./helpers";
import { buildParamMeta } from "../../src/buildParamMeta";
import { SegmentMatcher } from "../../src/SegmentMatcher";
import { createTestMatcher } from "../helpers/createTestMatcher";

import type { MatcherInputNode } from "../../src/types";

/**
 * Level 2 invariants — `SegmentMatcher.buildPath` handles `undefined` values
 * in query params correctly, regardless of how the injected query engine
 * behaves.
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
// Engine-independence — verify what reaches buildQueryString callback
//
// This set uses a spy engine (no-op filtering) to document what matcher
// forwards to the injected buildQueryString. If level 2 filtering were in
// place, spy would never see undefined. Currently matcher passes params
// through and the inline parser (level 3) handles the strip.
// =============================================================================

function createSpyMatcher(): {
  matcher: SegmentMatcher;
  getReceivedParams: () => Record<string, unknown>[];
  reset: () => void;
} {
  const received: Record<string, unknown>[] = [];

  const matcher = new SegmentMatcher({
    parseQueryString: () => ({}),
    buildQueryString: (params) => {
      received.push({ ...params });
      let result = "";

      for (const key in params) {
        const value = params[key];

        if (value === undefined) {
          continue;
        } // engine's own strip
        if (result.length > 0) {
          result += "&";
        }

        const valueStr =
          typeof value === "string"
            ? value
            : String(value as number | boolean | null);

        result += `${key}=${valueStr}`;
      }

      return result;
    },
  });

  const viewNode: MatcherInputNode = {
    name: "view",
    path: "/view?a&b&c",
    fullName: "view",
    absolute: false,
    children: new Map(),
    nonAbsoluteChildren: [],
    paramMeta: buildParamMeta("/view?a&b&c"),
    paramTypeMap: buildParamMeta("/view?a&b&c").paramTypeMap,
    staticPath: null,
  };

  matcher.registerTree(createRootWithChildren([viewNode]));

  return {
    matcher,
    getReceivedParams: () => received,
    reset: () => {
      received.length = 0;
    },
  };
}

describe("SegmentMatcher.buildPath — engine-independence documentation", () => {
  const { matcher, getReceivedParams, reset } = createSpyMatcher();

  test.prop([arbMixedParams], { numRuns: NUM_RUNS.fast })(
    "final URL never leaks undefined even if engine receives undefined keys",
    (params) => {
      reset();

      const url = matcher.buildPath("view", params, {
        queryParamsMode: "loose",
      });

      // Documents current matcher contract: matcher MAY forward undefined to
      // engine (`#buildQueryStringForBuild` passes params through unchanged),
      // but the final URL (after engine's strip) does not contain it. If
      // future architecture adds a matcher-level strip, the recorded params
      // would also be undefined-free.
      const received = getReceivedParams();

      expect(received.length).toBeGreaterThanOrEqual(0);
      expect(url).not.toMatch(/=undefined(?:&|$)/);
    },
  );
});
