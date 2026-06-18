import { describe, expect, it } from "vitest";

import { keep, omit, parse } from "../../src";

/**
 * Scale guards for `omit` / `keep` partitioning.
 *
 * Both slice the raw query string chunk-by-chunk, route each chunk to a kept or
 * removed accumulator via `appendChunk` (string `+=`) guided by a `Set` lookup,
 * then `parse` the accumulated side. These assert at scale what small-input tests
 * cannot: across tens of thousands of params, the partition is exact — every key
 * lands on exactly one side, none lost or leaked across the long concatenation.
 * The timing ceiling is a generous catastrophe-guard against an O(n²) regression
 * (e.g. re-`parse`-ing inside the loop, or an array-of-chunks `indexOf` dedup),
 * which at this N runs into seconds; it is sized far above healthy so contention
 * cannot flake it. The exact partition is the discriminating guard.
 *
 * **No heap tests** — `omit`/`keep` return fresh values and retain nothing.
 */

const STRING_SAFE = { numberFormat: "none", booleanFormat: "none" } as const;
const N = 50_000;
const qs = Array.from({ length: N }, (_, i) => `k${i}=v${i}`).join("&");
// Remove/keep the even-indexed half; the odd half is the complement.
const evenKeys = Array.from({ length: N / 2 }, (_, i) => `k${i * 2}`);

describe("omit: partition at scale", () => {
  it(`omits ${N / 2} of ${N} keys with an exact remaining/removed partition`, () => {
    omit(qs, evenKeys, STRING_SAFE); // warm up

    const t0 = performance.now();
    const result = omit(qs, evenKeys, STRING_SAFE);
    const ms = performance.now() - t0;

    const remaining = parse(result.querystring, STRING_SAFE);

    // Even keys removed, odd keys retained — counts and a sample on both sides.
    expect(Object.keys(remaining)).toHaveLength(N / 2);
    expect(Object.keys(result.removedParams)).toHaveLength(N / 2);

    for (let i = 0; i < N; i += 1031) {
      const even = i % 2 === 0;

      expect(`k${i}` in remaining).toBe(!even);
      expect(`k${i}` in result.removedParams).toBe(even);
    }

    expect(ms).toBeLessThan(800);
  });
});

describe("keep: partition at scale", () => {
  it(`keeps ${N / 2} of ${N} keys with keptParams matching exactly`, () => {
    keep(qs, evenKeys, STRING_SAFE); // warm up

    const t0 = performance.now();
    const result = keep(qs, evenKeys, STRING_SAFE);
    const ms = performance.now() - t0;

    const reparsed = parse(result.querystring, STRING_SAFE);

    // keptParams holds exactly the even keys; the re-parsed querystring agrees.
    expect(Object.keys(result.keptParams)).toHaveLength(N / 2);
    expect(Object.keys(reparsed)).toHaveLength(N / 2);

    for (let i = 0; i < N; i += 1031) {
      const even = i % 2 === 0;

      expect(`k${i}` in result.keptParams).toBe(even);
      expect(result.keptParams[`k${i}`]).toBe(even ? `v${i}` : undefined);
    }

    expect(ms).toBeLessThan(800);
  });
});
