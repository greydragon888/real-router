// packages/svelte/tests/property/createReactiveSource.properties.ts

/**
 * Property-based tests for `createReactiveSource`.
 *
 * The function bridges a `RouterSource<T>` to a Svelte-reactive
 * `{ readonly current: T }` getter. Under `environment: "node"` (no Svelte
 * client runtime), `svelte/reactivity` resolves to its server stub —
 * `createSubscriber(_) => () => {}`. That stub is exactly what we want here:
 * it isolates the property test from Svelte's effect tracking and lets us
 * exercise the function's pure data path (`subscribe(); return getSnapshot()`)
 * against a fake `RouterSource`. Reactivity itself is covered by stress and
 * functional tests under jsdom.
 *
 * Invariants (closes review §6 Invariant 8):
 *
 * 1. **Identity preservation** — every read of `.current` returns the value
 *    produced by `source.getSnapshot()`, by reference. The function must not
 *    clone, freeze-wrap, or apply `$state.snapshot()` — those would invalidate
 *    every downstream `$derived` on each read.
 * 2. **Multiple reads, same snapshot** — when `getSnapshot()` returns a
 *    stable reference, repeated `.current` reads return the same reference
 *    via `Object.is`.
 * 3. **Snapshot transitions** — when the fake source advances its snapshot,
 *    the next `.current` read picks up the new value (no caching).
 * 4. **Error propagation** — if `getSnapshot()` throws, `.current` propagates
 *    the throw to the caller (no swallowing, no fallback).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createReactiveSource } from "../../src/createReactiveSource.svelte";

import type { RouterSource } from "@real-router/sources";

interface FakeSource<T> extends RouterSource<T> {
  setSnapshot: (next: T) => void;
}

function makeFakeSource<T>(initial: T): FakeSource<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    destroy: () => {
      listeners.clear();
    },
    setSnapshot: (next) => {
      snapshot = next;
      listeners.forEach((l) => {
        l();
      });
    },
  };
}

describe("createReactiveSource — Property Tests", () => {
  describe("Invariant 1: Identity preservation — .current returns getSnapshot() by reference", () => {
    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "primitive snapshot is returned verbatim (Object.is identity)",
      (value) => {
        const source = makeFakeSource(value);
        const reactive = createReactiveSource(source);

        expect(Object.is(reactive.current, value)).toBe(true);
      },
    );

    test.prop([fc.array(fc.integer(), { minLength: 0, maxLength: 8 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "frozen-object snapshot is returned by reference (no cloning)",
      (items) => {
        const ref = Object.freeze({ items });
        const source = makeFakeSource(ref);
        const reactive = createReactiveSource(source);

        // Strict referential equality — clone or freeze-wrap would break this.
        expect(reactive.current).toBe(ref);
      },
    );

    test("symbol snapshot is returned by reference", () => {
      const sym = Symbol("snapshot");
      const source = makeFakeSource(sym);
      const reactive = createReactiveSource(source);

      expect(reactive.current).toBe(sym);
    });
  });

  describe("Invariant 2: Multiple reads return the same reference while snapshot is stable", () => {
    test.prop([fc.integer({ min: 2, max: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("N consecutive reads return identical refs", (n) => {
      const ref = Object.freeze({ marker: "stable" });
      const source = makeFakeSource(ref);
      const reactive = createReactiveSource(source);

      for (let i = 0; i < n; i++) {
        expect(reactive.current).toBe(ref);
      }
    });
  });

  describe("Invariant 3: Snapshot transitions are observable on the next read", () => {
    // The function calls `source.getSnapshot()` fresh on every `.current`
    // access — no internal caching. After the fake source advances, the
    // next read must reflect the new value.
    test.prop(
      [
        fc.array(fc.integer({ min: -1000, max: 1000 }), {
          minLength: 2,
          maxLength: 8,
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "sequence of setSnapshot calls is reflected by .current reads",
      (values) => {
        const source = makeFakeSource(values[0]);
        const reactive = createReactiveSource(source);

        for (const next of values) {
          source.setSnapshot(next);

          expect(reactive.current).toBe(next);
        }
      },
    );
  });

  describe("Invariant 4: Error propagation — getSnapshot throws → .current throws", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 30 })], {
      numRuns: NUM_RUNS.standard,
    })("getSnapshot throw is not swallowed", (message) => {
      const source: RouterSource<unknown> = {
        subscribe: () => () => undefined,
        getSnapshot: () => {
          throw new Error(message);
        },
        destroy: () => undefined,
      };
      const reactive = createReactiveSource(source);

      expect(() => reactive.current).toThrow(message);
    });
  });
});
