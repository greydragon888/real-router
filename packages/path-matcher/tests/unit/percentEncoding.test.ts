import { describe, expect, it } from "vitest";

import { validatePercentEncoding } from "../../src/percentEncoding";

/**
 * `validatePercentEncoding` is a pure `string -> boolean` predicate (its full
 * contract is its return value), and `isHexCodePoint` is its only-internal
 * helper — so these assertions exercise both through the single public entry,
 * matching the direct-`src` convention already used by `encoding.test.ts`.
 *
 * The boundary cases are chosen to discriminate the exact hex-range comparisons
 * in `isHexCodePoint` (`0x30-0x39`, `0x41-0x46`, `0x61-0x66`): each invalid
 * input picks a code point that lands in a *gap* a mutated comparison would
 * wrongly admit, and each upper-bound input ('F'/'f') is the exact `<=` edge a
 * `<` mutation would drop.
 */
describe("validatePercentEncoding", () => {
  it("accepts a string with no percent sequences", () => {
    expect(validatePercentEncoding("plain/path-segment")).toBe(true);
  });

  it("accepts well-formed percent triplets (digits + both letter cases)", () => {
    expect(validatePercentEncoding("%20")).toBe(true);
    expect(validatePercentEncoding("%00")).toBe(true);
    expect(validatePercentEncoding("%99")).toBe(true);
    expect(validatePercentEncoding("%aF")).toBe(true);
    expect(validatePercentEncoding("a%20b%2Fc")).toBe(true);
    expect(validatePercentEncoding("%E6%97%A5")).toBe(true);
  });

  // Upper boundaries of the letter ranges — kills `code <= 0x46` -> `< 0x46`
  // and `code <= 0x66` -> `< 0x66` (only 'F'/'f' distinguish them).
  it("accepts the exact upper-boundary hex letters F and f", () => {
    expect(validatePercentEncoding("%FF")).toBe(true);
    expect(validatePercentEncoding("%ff")).toBe(true);
  });

  // Non-hex second/first nibble — kills the bulk of isHexCodePoint mutants
  // (whole-expression -> true, && -> ||, range-half -> true) plus the loop /
  // `%`-detect / hex-reject guards that would otherwise pass the string.
  it("rejects a triplet whose digits are not hex at all ('z' = 0x7A)", () => {
    expect(validatePercentEncoding("%zz")).toBe(false);
  });

  // ':' = 0x3A sits in the gap *between* the digit range (<=0x39) and the
  // upper-letter range (>=0x41); kills `code >= 0x41 -> true` and
  // `code >= 0x61 -> true` (both would admit 0x3A).
  it("rejects a triplet in the 0x3A-0x40 range gap (':')", () => {
    expect(validatePercentEncoding("%::")).toBe(false);
  });

  // '-' = 0x2D is below the digit range; kills `code >= 0x30 -> true`
  // (which would turn the digit half into `code <= 0x39`, admitting 0x2D).
  it("rejects a triplet below the digit range ('-' = 0x2D)", () => {
    expect(validatePercentEncoding("%--")).toBe(false);
  });

  // One valid + one invalid nibble — kills the `||` -> `&&` mutation of the
  // hex-reject check (a single bad nibble must still reject).
  it("rejects a triplet with one valid and one invalid nibble", () => {
    expect(validatePercentEncoding("%az")).toBe(false);
    expect(validatePercentEncoding("%z0")).toBe(false);
  });

  // Truncated `%` — kills `return false -> return true` in the length guard.
  it("rejects a truncated percent sequence at end of string", () => {
    expect(validatePercentEncoding("%")).toBe(false);
    expect(validatePercentEncoding("%a")).toBe(false);
    expect(validatePercentEncoding("ok-%")).toBe(false);
  });
});
