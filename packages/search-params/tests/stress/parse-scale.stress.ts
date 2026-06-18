import { describe, expect, it } from "vitest";

import { build, parse } from "../../src";

/**
 * Scale guards for `parse` breadth and array accumulation.
 *
 * `parse` is on the router hot path (every navigation parses the query string)
 * and the input is user-controlled (the address bar). These assert what unit and
 * property tests (small inputs, ≤5 keys) cannot: across tens of thousands of
 * params, parse (a) drops/merges/cross-wires no key and accumulates arrays in
 * order, and (b) stays well below quadratic. The precise, non-flaky guard is the
 * structural correctness at scale (count + sampled identity); the timing ceiling
 * is a generous catastrophe-guard for a severe super-linear regression (e.g.
 * replacing the `Object.hasOwn` collision check with an `Object.keys().includes`
 * scan → O(n²)), sized far above the healthy time so it does not flake.
 *
 * **No heap tests:** `parse` returns a fresh object and retains nothing (the only
 * caches are the fixed `DEFAULT_OPTIONS`/strategy singletons), so a create→drop
 * loop is GC-masked — a heap-threshold assertion here would be theatre. **No
 * recursion-depth guard:** parse is fully iterative; there is no stack to blow.
 */

describe("parse: wide breadth (distinct keys)", () => {
  const N = 50_000;
  const qs = Array.from({ length: N }, (_, i) => `k${i}=v${i}`).join("&");

  it(`parses ${N} distinct params with no key dropped, merged, or cross-wired`, () => {
    parse(qs); // warm up JIT before timing

    const t0 = performance.now();
    const parsed = parse(qs);
    const ms = performance.now() - t0;

    // Precise guard: every key present exactly once, mapped to its own value.
    expect(Object.keys(parsed)).toHaveLength(N);

    for (let i = 0; i < N; i += 1009) {
      expect(parsed[`k${i}`]).toBe(`v${i}`);
    }

    // Catastrophe-guard for an O(n²) collision-detection regression (calibrated:
    // replacing `Object.hasOwn` with an `Object.keys().includes` rescan runs into
    // tens of seconds here). Healthy is ~8 ms, so the 800 ms ceiling has ~100×
    // margin below and ≫10× above the quadratic — it cannot flake. The no-drop
    // count above is the precise discriminating guard.
    expect(ms).toBeLessThan(800);
  });
});

describe("parse: repeated-key array accumulation", () => {
  const K = 80_000;
  const qs = Array.from({ length: K }, (_, i) => `tag=v${i}`).join("&");

  it(`accumulates ${K} repeats of one key into an ordered array of length ${K}`, () => {
    parse(qs, { numberFormat: "none" }); // warm up

    const t0 = performance.now();
    const parsed = parse(qs, { numberFormat: "none" });
    const ms = performance.now() - t0;

    const tag = parsed.tag;

    expect(Array.isArray(tag)).toBe(true);
    expect(tag).toHaveLength(K);

    // Order is preserved across the accumulation (no shuffle/truncation).
    for (let i = 0; i < K; i += 1013) {
      expect((tag as string[])[i]).toBe(`v${i}`);
    }

    // Guards the O(1)-amortized push path (calibrated: a copy-per-append
    // regression — `[...currentValue, v]` per repeat — is O(n²), ~6.7 s at this K
    // vs ~7 ms healthy, so the 800 ms ceiling separates them cleanly).
    expect(ms).toBeLessThan(800);
  });
});

describe("parse: comma array at scale (literal commas preserved)", () => {
  const N = 20_000;
  // Half the elements embed a literal comma → encoded as %2C by build and must
  // survive as a literal, distinct from the unencoded ',' element separator.
  const elements = Array.from({ length: N }, (_, i) =>
    i % 2 === 0 ? `a${i},b${i}` : `v${i}`,
  );
  const opts = { arrayFormat: "comma" as const, numberFormat: "none" as const };
  const qs = build({ list: elements }, opts);

  it(`splits ${N} comma elements in order, keeping embedded commas literal`, () => {
    const parsed = parse(qs, opts);
    const list = parsed.list;

    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(N);

    for (let i = 0; i < N; i += 503) {
      expect((list as string[])[i]).toBe(elements[i]);
    }
  });
});

describe("parse: bracket array at scale", () => {
  const N = 20_000;
  const qs = Array.from({ length: N }, (_, i) => `items[]=v${i}`).join("&");
  const opts = {
    arrayFormat: "brackets" as const,
    numberFormat: "none" as const,
  };

  it(`accumulates ${N} bracketed elements into an ordered array`, () => {
    const parsed = parse(qs, opts);
    const items = parsed.items;

    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(N);

    for (let i = 0; i < N; i += 509) {
      expect((items as string[])[i]).toBe(`v${i}`);
    }
  });
});
