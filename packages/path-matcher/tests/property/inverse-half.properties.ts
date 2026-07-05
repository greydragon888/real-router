import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createTestMatcher } from "../helpers/createTestMatcher";
import {
  arbNumericParam,
  arbSafeParamValue,
  arbSplatValue,
  createInputNode,
  createRootWithChildren,
  NUM_RUNS,
} from "./helpers";

/**
 * Inverse-pair contract for the PATH grammar: `range(buildPath) ⊆ dom(match)` —
 * every URL `buildPath` emits for a route must be one that route's own `match`
 * accepts. The path-grammar mirror of the search-params inverse-pair (#1155).
 *
 * The generator composes the topology axes where build/match/meta desynced —
 * an optional param (optionally constrained), in every position (leading / mid /
 * trailing), present or omitted — so it reaches the exact shapes #1147 (leading
 * optional omit → "//") and #1148 (constraint on an omitted optional →
 * `test(undefined)`) lived in, plus required splats. Two shapes are deliberately
 * out of range (separate, orthogonal semantics, not this class): an optional
 * param ADJACENT to another param (positional reuse, #736) and an optional splat
 * `*name?` (rejected at registration, #1149).
 */

// An optional param, bracketed by optional static prefix/suffix so it lands in
// leading / mid / trailing position but is NEVER adjacent to another param.
const arbOptionalRoute = fc
  .record({
    prefix: fc.boolean(),
    suffix: fc.boolean(),
    constrained: fc.boolean(),
    present: fc.boolean(),
    numValue: arbNumericParam,
    strValue: arbSafeParamValue,
  })
  .map(({ prefix, suffix, constrained, present, numValue, strValue }) => {
    const marker = constrained ? String.raw`:p<\d+>?` : ":p?";
    const value = constrained ? numValue : strValue;
    const path = `${prefix ? "/s0" : ""}/${marker}${suffix ? "/s1" : ""}`;
    const params: Record<string, string> = present ? { p: value } : {};

    return { path, params };
  });

// A required splat with a static prefix (splat captures 1..N segments).
const arbSplatRoute = arbSplatValue.map((rest) => ({
  path: "/files/*rest",
  params: { rest },
}));

const arbRoute = fc.oneof(arbOptionalRoute, arbSplatRoute);

describe("path inverse-pair (#1147/#1148/#1149 class)", () => {
  // TOTALITY — `range(buildPath) ⊆ dom(match)`, the exact contract the three bugs
  // violated (each made `buildPath` emit a URL its own `match` rejected).
  test.prop([arbRoute], { numRuns: NUM_RUNS.standard })(
    "range(buildPath) ⊆ dom(match): every built URL is one its own match accepts",
    ({ path, params }) => {
      const matcher = createTestMatcher();

      matcher.registerTree(
        createRootWithChildren([
          createInputNode({ name: "r", path, fullName: "r" }),
        ]),
      );

      const built = matcher.buildPath("r", params);

      expect(
        matcher.match(built),
        `buildPath("${path}", ${JSON.stringify(params)}) → "${built}" did not match`,
      ).toBeDefined();
    },
  );
});
