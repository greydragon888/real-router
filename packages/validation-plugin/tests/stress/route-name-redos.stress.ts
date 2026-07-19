import { describe, expect, it } from "vitest";

import { validateRouteName } from "../../src/type-guards";
import { isRouteName } from "../../src/type-guards/guards/routes";

/**
 * ReDoS-resistance sentinel for the route-name grammar `FULL_ROUTE_PATTERN`
 * (shared by `isRouteName` and `validateRouteName`), which run on untrusted route
 * names.
 *
 * The pattern is currently safe by construction — each `(?:\.…)*` repetition is
 * anchored by a literal `.` that the inner `[\w-]*` cannot match, so the inner and
 * outer quantifiers consume disjoint character classes and cannot backtrack
 * catastrophically. **But `security/detect-unsafe-regex` is disabled on that line**
 * (the rule over-flags the nested `*`), so lint will NOT catch a future edit that
 * reintroduces ambiguity — e.g. adding `.` to the inner class to "allow dotted
 * segments" (`[\w.-]`) makes the inner class overlap the separator and turns the
 * pattern catastrophic. This runtime sentinel is therefore the only automated
 * guard against that regression.
 *
 * Discriminating power (measured): the real pattern resolves these adversarial
 * near-limit inputs in <= 0.1 ms; the `[\w.-]` vulnerable variant catastrophically
 * backtracks and does not return on an input as short as ~50 characters (hangs for
 * seconds+). The 100 ms ceiling is ~1000x over healthy (flake-proof under the
 * concurrent CPU load of a turbo build) and far below any backtracking blow-up.
 *
 * Inputs stay within `MAX_ROUTE_NAME_LENGTH` (10k) so the regex actually runs —
 * longer names are length-rejected before the pattern test, which would mask a
 * vulnerable pattern.
 */

// Adversarial near-limit names that FAIL (so the matcher must explore the whole
// input — the worst case for a backtracking variant) and stay <= 10k chars.
const ADVERSARIAL: readonly { name: string; input: string }[] = [
  {
    name: "long single-segment run + trailing dot",
    input: `${"a".repeat(9998)}.`,
  },
  { name: "many dot-segments + trailing dot", input: `a${".a".repeat(4999)}.` },
  { name: "long hyphen run + trailing dot", input: `a${"-".repeat(9997)}.` },
  {
    name: "alternating dot-segments + invalid tail",
    input: `${"a.".repeat(4999)}!`,
  },
];

describe("S3: route-name validation stays linear on adversarial input (ReDoS sentinel)", () => {
  it.each(ADVERSARIAL)(
    'isRouteName rejects "$name" without catastrophic backtracking',
    ({ input }) => {
      const start = performance.now();
      const result = isRouteName(input);
      const elapsedMs = performance.now() - start;

      expect(result).toBe(false);
      expect(elapsedMs).toBeLessThan(100);
    },
  );

  it("validateRouteName rejects adversarial input without hanging", () => {
    const input = `a${".a".repeat(4999)}.`;

    const start = performance.now();

    expect(() => {
      validateRouteName(input, "navigate");
    }).toThrow(TypeError);

    expect(performance.now() - start).toBeLessThan(100);
  });
});
