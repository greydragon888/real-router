import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { NUM_RUNS } from "./helpers";
import {
  CONSTRAINT_BODY_PATTERN,
  isConstraintBalanced,
} from "../../../../src/engine/path-matcher/constraint-grammar";

/**
 * Property-lock for the constraint-`<...>` single source of truth (#804 §3.4).
 *
 * The grammar is expressed two ways in `path-matcher`: the regex atom
 * `CONSTRAINT_BODY_PATTERN` (consumed by every match/strip/build regex) and the
 * imperative `isConstraintBalanced` scan (consumed by the route-tree gate and the
 * registerTree backstop). They are equivalent by construction, but nothing in the
 * type system enforces it — so this locks it: strip every well-formed `<...>` pair
 * (built from the atom) and the balance verdict must match the scan on any input.
 * If a future edit drifts the atom from the scan, this fails.
 */

// STAR-strip oracle: remove every well-formed `<...>` pair (grammar = the atom),
// then the path is "balanced" iff no stray `<` or `>` remains.
const strippedBalanced = (path: string): boolean =>
  !/[<>]/.test(
    path.replaceAll(new RegExp(`<${CONSTRAINT_BODY_PATTERN}>`, "g"), ""),
  );

// Delimiter-heavy generator: strings biased toward `<`/`>` so the balance logic
// is actually exercised (a plain fc.string almost never produces a delimiter).
const arbDelimited = fc
  .array(fc.constantFrom("<", ">", "a", "b", "/", ":", "\\", "d", "+", "?"), {
    maxLength: 24,
  })
  .map((chars) => chars.join(""));

describe("constraint-grammar property-lock (#804)", () => {
  test.prop([arbDelimited], { numRuns: NUM_RUNS.thorough })(
    "isConstraintBalanced agrees with the atom-derived strip on delimiter-heavy paths",
    (path) => {
      expect(isConstraintBalanced(path)).toBe(strippedBalanced(path));
    },
  );

  test.prop([fc.string({ maxLength: 40 })], { numRuns: NUM_RUNS.thorough })(
    "isConstraintBalanced agrees with the atom-derived strip on arbitrary strings",
    (path) => {
      expect(isConstraintBalanced(path)).toBe(strippedBalanced(path));
    },
  );

  // Discriminating-power guard: the oracle uses the canonical `*` atom. A `+`
  // (PLUS) body would diverge from the scan on the empty `<>` — so this test
  // genuinely pins the STAR grammar, not any-grammar. If someone reverts the
  // atom to `[^>]+`, `strippedBalanced("<>")` flips to false while the scan
  // stays true, and the property above starts failing.
  it("the oracle grammar is the STAR atom, not PLUS (empty <> is the discriminator)", () => {
    const plusStripped = (path: string): boolean =>
      // eslint-disable-next-line sonarjs/super-linear-regex -- test oracle, bounded literal input
      !/[<>]/.test(path.replaceAll(/<[^>]+>/g, ""));

    // scan and STAR-strip agree that `<>` is balanced; PLUS-strip disagrees.
    expect(isConstraintBalanced("<>")).toBe(true);
    expect(strippedBalanced("<>")).toBe(true);
    expect(plusStripped("<>")).toBe(false);
  });
});
