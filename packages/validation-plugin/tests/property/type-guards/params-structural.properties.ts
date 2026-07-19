import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbitraryParamsCandidate,
  isPlainSerializable,
  richInvalidParamsArbitrary,
  validContainerSubtree,
} from "./helpers";
import { isParams } from "../../../src/type-guards";

/**
 * Structural property tests for `isParams` — the on-path cycle / done-set walk
 * (#786) and the unbounded-depth contract (#901). The dictionary / letrec
 * generators in the main suite never emit shared references, cycles, or deep
 * nesting, so these behaviours were invisible to it (the "leaky generator" blind
 * spot from the original audit). Here a differential oracle plus hand-built DAG /
 * cycle / deep structures exercise them directly.
 */
describe("Params structural properties (DAGs, cycles, depth)", () => {
  // INV 27: differential oracle — isParams matches an independent recursive
  // reference across arbitrary mixed-validity structures (accepted AND rejected).
  test.prop([arbitraryParamsCandidate], { numRuns: 20_000 })(
    "isParams agrees with an independent recursive serializability oracle",
    (value) => {
      expect(isParams(value)).toBe(isPlainSerializable(value));
    },
  );

  // INV 28: a deep, branching valid subtree shared under many keys is a DAG, not a
  // cycle — accepted. Depth-1 diamonds in the edge-case suite miss done-set bugs
  // that only surface when the shared subtree is itself deep.
  test.prop([validContainerSubtree, fc.integer({ min: 2, max: 5 })], {
    numRuns: 5000,
  })(
    "accepts a deep valid subtree shared under multiple keys (DAG)",
    (sub, copies) => {
      const obj: Record<string, unknown> = { nested: { deep: sub } };

      for (let i = 0; i < copies; i++) {
        obj[`share${i}`] = sub;
      }

      expect(isParams(obj)).toBe(true);
    },
  );

  // INV 29: a diamond chain (each level references the next twice) of arbitrary
  // depth stays valid and validates in linear time — the done-set prevents the
  // O(2^depth) re-walk an on-path-only check would incur (a regression hangs the
  // run). The stress suite owns the timing; this owns the boolean across depths.
  test.prop([fc.integer({ min: 1, max: 300 })], { numRuns: 1000 })(
    "accepts a diamond chain of arbitrary depth (no exponential blow-up)",
    (depth) => {
      let node: Record<string, unknown> = { leaf: 1 };

      for (let i = 0; i < depth; i++) {
        node = { a: node, b: node };
      }

      expect(isParams(node)).toBe(true);
    },
  );

  // INV 30: a back-edge to ANY ancestor on the current DFS path is a cycle —
  // rejected. Guards against an "only check the immediate parent" regression that
  // the two hard-coded circular examples cannot.
  test.prop([fc.integer({ min: 1, max: 60 }), fc.nat()], { numRuns: 5000 })(
    "rejects a back-edge to any ancestor on the current path",
    (depth, ancestorPick) => {
      const levels: Record<string, unknown>[] = [];
      const root: Record<string, unknown> = { v: 1 };

      levels.push(root);

      let current = root;

      for (let i = 0; i < depth; i++) {
        const next: Record<string, unknown> = { v: 1 };

        current.child = next;
        levels.push(next);
        current = next;
      }

      // The deepest node points back to a randomly chosen ancestor — all of
      // which are still on the path when it is reached.
      current.back = levels[ancestorPick % levels.length];

      expect(isParams(root)).toBe(false);
    },
  );

  // INV 31: the defining #786 distinction — the same valid subtree is accepted when
  // reached off the path (diamond) and the structure is rejected when a descendant
  // points back onto the path (cycle). Conflating `onPath` and `done` breaks one arm.
  test.prop([validContainerSubtree], { numRuns: 5000 })(
    "accepts an off-path shared reference but rejects an on-path back-edge",
    (sub) => {
      // Diamond: `sub` reached by two disjoint paths → accepted.
      expect(isParams({ left: sub, right: sub })).toBe(true);

      // Cycle: a descendant points back to its ancestor → rejected, even though
      // the same valid `sub` is also present off-path.
      const cyclic: Record<string, unknown> = { data: sub };
      const inner: Record<string, unknown> = {};

      cyclic.inner = inner;
      inner.back = cyclic;

      expect(isParams(cyclic)).toBe(false);
    },
  );

  // INV 32: isParams rejects the FULL invalid space (cycles, nested class
  // instances, nested NaN/Infinity, functions/symbols, top-level arrays) — far
  // beyond the primitives-only generator behind the flat-object invariants.
  test.prop([richInvalidParamsArbitrary], { numRuns: 10_000 })(
    "isParams rejects the rich invalid space",
    (value) => {
      expect(isParams(value)).toBe(false);
    },
  );

  // Note: deep-nesting / stack-overflow coverage (#901) lives in the functional
  // suite (fixed 100k chains) and stress S1 (500k); a generative depth range here
  // would be a strictly weaker duplicate — fast-check undersamples the overflow
  // regime (the recursive-regression threshold is ~6–12k frames in this env, above
  // the practical generator range), so it is intentionally omitted.
});
