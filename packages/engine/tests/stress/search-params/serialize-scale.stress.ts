import { describe, expect, it } from "vitest";

import { build, parseQuery } from "../../../src/search-params";

/**
 * Scale guards for `build` and the `build → parseQuery` round-trip.
 *
 * `build` serializes query params on every navigation. These assert at scale what
 * small-input tests cannot: building tens of thousands of params round-trips
 * losslessly through `parseQuery` (the cross-check oracle — no key dropped, reordered,
 * or value mangled). The lossless round-trip is the precise discriminating guard.
 *
 * The wide-build case adds a catastrophe timing ceiling: `build` accumulates with
 * `parts.push(...).join("&")`, and a regression turning the join into a
 * re-scanning concat (calibrated: an `indexOf` dedup) is O(n²) — tens of seconds
 * vs ~10 ms healthy, far below the 800 ms ceiling so it cannot flake. The
 * large-array case has no timing ceiling: its `+=` accumulation is rope-linear in
 * V8 with no realistic O(n²) regression, so the round-trip alone guards it.
 *
 * Options are pinned to `none`/`none` so the round-trip is an exact string
 * equality (no number/boolean coercion to normalize); coercion is covered by the
 * property suite.
 *
 * **No heap tests** — `build` returns a string and retains nothing (GC-masked).
 */

const STRING_SAFE = { numberFormat: "none", booleanFormat: "none" } as const;

describe("build: wide breadth round-trips losslessly", () => {
  const N = 50_000;
  const params: Record<string, string> = {};

  for (let i = 0; i < N; i++) {
    params[`k${i}`] = `v${i}`;
  }

  it(`builds ${N} params and parses them back identically`, () => {
    build(params, STRING_SAFE); // warm up

    const t0 = performance.now();
    const qs = build(params, STRING_SAFE);
    const ms = performance.now() - t0;

    const parsed = parseQuery(qs, STRING_SAFE);

    expect(Object.keys(parsed)).toHaveLength(N);
    expect(parsed).toStrictEqual(params);

    // Catastrophe-guard against an O(n²) build regression (calibrated: a join
    // replaced by an `indexOf` dedup runs ~16 s here vs ~10 ms healthy).
    expect(ms).toBeLessThan(800);
  });
});

describe("build: large single array round-trips losslessly", () => {
  const N = 30_000;
  const list = Array.from({ length: N }, (_, i) => `v${i}`);
  const opts = { arrayFormat: "none" as const, ...STRING_SAFE };

  it(`builds a ${N}-element array (repeated keys) and parses it back in order`, () => {
    const qs = build({ list }, opts);
    const parsed = parseQuery(qs, opts);

    expect(parsed.list).toHaveLength(N);
    expect(parsed.list).toStrictEqual(list);
  });
});
