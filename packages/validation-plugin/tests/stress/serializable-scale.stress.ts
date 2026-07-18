import { describe, expect, it } from "vitest";

import { isParams } from "../../src/type-guards";

/**
 * Robustness / DoS-resistance + anti-quadratic guards for the recursive-tree
 * validator `isParams`.
 *
 * `isParams` runs at the validation boundary on UNTRUSTED input: user-supplied
 * params to `navigate` / `makeState` (validation-plugin calls `isParams`
 * directly). So it must stay well-behaved on inputs no realistic app produces but
 * an attacker can: chains thousands of levels deep, hundreds of thousands of
 * sibling objects. (The `isStateStrict` history.state path in the browser/hash
 * plugins carries the same guard as a lockstep twin in shared/browser-env; its
 * stack-safety is sentinelled in browser-plugin's stress suite.)
 *
 * Coverage and small-input property tests never reach these sizes. The guard is
 * pure and stateless (the per-call `WeakSet` is GC'd, there is no module-level
 * state), so there is NO heap-leak surface here — these are no-crash + bounded-time
 * guards, not heap snapshots.
 */

// Build a chain { child: { child: ... leaf } } `depth` levels deep.
const deepObjectChain = (depth: number, leaf: unknown): unknown => {
  let node: unknown = leaf;

  for (let i = 0; i < depth; i++) {
    node = { child: node };
  }

  return node;
};

describe("S1: deep nesting validates without overflowing the call stack (#901)", () => {
  // The native recursion limit is ~2.4k frames on V8; a recursive validator throws
  // `RangeError: Maximum call stack size exceeded` at this scale. The iterative
  // validator walks the tree on a heap-allocated stack, so it scales to any depth.
  // 500k is ~200x the native limit — a regression back to recursion fails instantly
  // (a thrown RangeError surfaces as a test error, not a `false`).
  const DEPTH = 500_000;

  it("accepts a 500k-deep valid object chain (returns true, no RangeError)", () => {
    expect(isParams(deepObjectChain(DEPTH, { leaf: 1 }))).toBe(true);
  });

  it("rejects a 500k-deep object chain with a back-edge to the root as circular (returns false, no RangeError)", () => {
    const root: Record<string, unknown> = {};
    let current = root;

    for (let i = 0; i < DEPTH; i++) {
      const next: Record<string, unknown> = {};

      current.child = next;
      current = next;
    }

    current.back = root;

    expect(isParams(root)).toBe(false);
  });
});

describe("S2: a large fan-out of distinct objects validates in linear time (anti-quadratic)", () => {
  it("validates 300k sibling objects via O(1) WeakSet membership, not an O(n) array scan", () => {
    // The discriminating case: `isSerializable` records every container it visits to
    // detect cycles and skip already-validated shared references. With a `WeakSet`
    // (O(1) has/add) the walk is linear; a regression to an array + `.includes`
    // (O(n) membership) makes it O(n^2). Measured on this machine: healthy ~40 ms;
    // the array-`.includes` mutant ~6500 ms (161x). The 800 ms ceiling is ~20x over
    // healthy (flake-proof under the concurrent CPU load of a turbo build) and ~8x
    // under the mutant — N=300k keeps the mutant margin hardware-robust (a faster CI
    // runner can't slip it under).
    const input = {
      list: Array.from({ length: 300_000 }, () => ({ a: 1 })),
    };

    const start = performance.now();
    const result = isParams(input);
    const elapsedMs = performance.now() - start;

    expect(result).toBe(true);
    expect(elapsedMs).toBeLessThan(800);
  });
});

describe("S3: a deep diamond chain validates in linear time, not exponential (#786)", () => {
  it("validates a 1k-level shared-reference chain via the done-set, no exponential blow-up", () => {
    // The discriminating case for on-path cycle detection: each level references the
    // next TWICE (a diamond). On-path semantics without a `done` (black) set would
    // re-walk every shared subtree on each re-entry — O(2^depth) — so even ~40 levels
    // would hang. The `done` set marks each subtree validated once, keeping the walk
    // linear (O(depth)); 1000 levels is ~2^1000 unfolded paths but only 1001 nodes.
    // (The ever-visited regression returns `false` here — a diamond is not a cycle —
    // which the functional/property suites already guard; this guards the *time*.)
    let node: Record<string, unknown> = { leaf: 1 };

    for (let i = 0; i < 1000; i++) {
      node = { a: node, b: node };
    }

    const start = performance.now();
    const result = isParams(node);
    const elapsedMs = performance.now() - start;

    expect(result).toBe(true);
    expect(elapsedMs).toBeLessThan(800);
  });
});
