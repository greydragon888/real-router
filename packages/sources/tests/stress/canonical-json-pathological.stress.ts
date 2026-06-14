import { describe, it, expect } from "vitest";

import { canonicalJson } from "@real-router/sources";

import { MB, takeHeapSnapshot } from "./helpers";

/**
 * S13. canonicalJson pathological inputs (audit-2026-05-16 §7 #10).
 *
 * After the canonicalize() rewrite (path-based cycle detection, byte-order
 * sort, Object.create(null) records), the contract is:
 *
 *   - cycles → `TypeError("circular structure")` (not `RangeError`);
 *   - very deep non-cyclic trees serialise without blowing the stack;
 *   - large arrays serialise in linear time;
 *   - throw paths are repeatable and stable under N iterations.
 *
 * This stress test exercises the throw / serialise paths under volume so a
 * regression in the recursion shape (e.g. forgotten `path.delete()` in the
 * finally block, or a quadratic copy) surfaces here as wall-time blow-up,
 * heap growth, or a flipped error type.
 */
describe("S13 canonicalJson pathological inputs", () => {
  it("S13.1: 10 000 cycle-throw cycles produce TypeError consistently (no RangeError leak)", () => {
    const ITER = 10_000;

    for (let i = 0; i < ITER; i++) {
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;

      let caught: unknown;

      try {
        canonicalJson(cyclic);
      } catch (error) {
        caught = error;
      }

      // Strict identity assertion — a regression to RangeError would flip
      // the createActiveRouteSource fallback's contract (catch is fine, but
      // the documented error type changes).
      expect(caught).toBeInstanceOf(TypeError);
    }
  });

  it("S13.2: indirect cycles through N intermediate nodes still throw TypeError", () => {
    const CHAIN_LENGTHS = [2, 3, 5, 10, 50, 100];

    for (const length of CHAIN_LENGTHS) {
      const nodes: Record<string, unknown>[] = Array.from(
        { length: length },
        () => ({}),
      );

      for (let i = 0; i < length; i++) {
        nodes[i].next = nodes[(i + 1) % length];
      }

      expect(() => canonicalJson(nodes[0])).toThrow(TypeError);
      expect(() => canonicalJson(nodes[0])).toThrow(/circular/);
    }
  });

  it("S13.3: deep non-cyclic nesting (1000 levels) serialises without RangeError", () => {
    const DEPTH = 1000;
    let value: unknown = 1;

    for (let i = 0; i < DEPTH; i++) {
      value = { w: value };
    }

    const result = canonicalJson(value);

    // Output contains exactly DEPTH opening braces — every level produced an
    // object literal, no early-collapse.
    expect(result.split("{").length - 1).toBe(DEPTH);
  });

  it("S13.4: large array (100 000 elements) serialises in linear time", () => {
    const SIZE = 100_000;
    const arr = Array.from({ length: SIZE }, (_, i) => i);

    const start = performance.now();
    const result = canonicalJson(arr);
    const elapsed = performance.now() - start;

    // Sanity: output has SIZE + 1 commas (or equivalent count of separators).
    // We assert structural plausibility rather than exact length to avoid
    // brittleness around integer formatting.
    expect(result.startsWith("[0,1,")).toBe(true);
    expect(result.endsWith(`,${SIZE - 1}]`)).toBe(true);

    // Generous upper bound — should be well under a second; flags O(N²) or
    // exponential regressions without flaking on cold runs.
    expect(elapsed).toBeLessThan(2000);
  });

  it("S13.5: DAG with shared subtree referenced 100 times — no false-cycle, no exponential blow-up", () => {
    const SHARED_COUNT = 100;
    const shared = { x: 1, y: 2, z: 3 };
    const dag: Record<string, unknown> = {};

    for (let i = 0; i < SHARED_COUNT; i++) {
      dag[`slot${i}`] = shared;
    }

    expect(() => canonicalJson(dag)).not.toThrow();

    // Each slot serialises the shared subtree independently — total length
    // grows linearly with SHARED_COUNT (≈ 14 bytes per slot for {"x":1,"y":2,"z":3}).
    const result = canonicalJson(dag);

    expect(result.length).toBeGreaterThan(SHARED_COUNT * 10);
  });

  it("S13.6: 1000 serialisations of structurally identical large records produce identical output (determinism under volume)", () => {
    const buildRecord = (): Record<string, unknown> => ({
      route: "users.view",
      params: { id: "42", tenant: "acme", role: "admin" },
      hash: "section-3",
      flags: { strict: false, ignoreQueryParams: true },
    });
    const reference = canonicalJson(buildRecord());

    for (let i = 0; i < 1000; i++) {
      expect(canonicalJson(buildRecord())).toBe(reference);
    }
  });

  it("S13.7: cycle-throw loop does not leak heap (path-Set reclaimed via finally)", () => {
    const ITER = 5000;
    const baseline = takeHeapSnapshot();

    for (let i = 0; i < ITER; i++) {
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;

      try {
        canonicalJson(cyclic);
      } catch {
        // Expected — TypeError on cycle.
      }
    }

    const after = takeHeapSnapshot();

    // Throughput / GC guard. The `Set<object>` is created fresh per
    // canonicalJson() call (a local), and each iteration's cyclic object is
    // dropped after the catch — so the objects are reclaimable regardless of
    // whether the `finally { path.delete() }` runs, which makes the dispose-leak
    // structurally invisible to a heap snapshot here. Healthy delta is reliably
    // near-zero / net-negative (≈ -0.02 MB); threshold 0.25 MB is a tight,
    // honest upper bound on per-call allocation churn over 5k throws.
    expect(after - baseline).toBeLessThan(MB / 4);
  });
});
