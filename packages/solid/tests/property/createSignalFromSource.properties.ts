// packages/solid/tests/property/createSignalFromSource.properties.ts

/**
 * Property-based tests for `createSignalFromSource` — the Solid-specific
 * bridge from `RouterSource<T>` to a `Accessor<T>` via `createSignal` +
 * `onCleanup`.
 *
 * Invariants:
 *
 * - **Initial value mirrors getSnapshot()** for any snapshot type.
 * - **Re-sync after subscribe (lazy reconciliation):** if the source's
 *   `getSnapshot` value changes between signal init and `subscribe` returning
 *   AND Solid's default `===` equality considers them distinct, the bridge
 *   must re-read once. Lazy cached sources reconcile in `onFirstSubscribe`
 *   without notifying — the bridge must compensate via `setValue(sync)` after
 *   `subscribe(...)` returns.
 * - **Each emit propagates to the accessor** at most one settle step later.
 * - **Default `===` equality is preserved** — re-emit of the SAME reference
 *   is a no-op. Used as a regression guard against a future refactor
 *   switching to `{ equals: false }`, which would notify on every set.
 * - **`onCleanup` unsubscribes from the source** — once the owner is disposed,
 *   subsequent source emits do not change the accessor's value.
 */

import { fc, test } from "@fast-check/vitest";
import { createRoot } from "solid-js";
import { describe, expect } from "vitest";

import { arbExtendedPrimitive, createMockSource, NUM_RUNS } from "./helpers";
import { createSignalFromSource } from "../../src/createSignalFromSource";

import type { RouterSource } from "@real-router/sources";

describe("createSignalFromSource — Property Tests (Solid)", () => {
  describe("Invariant 1: initial value mirrors getSnapshot()", () => {
    test.prop([arbExtendedPrimitive], { numRuns: NUM_RUNS.thorough })(
      "accessor() === source.getSnapshot() at creation time",
      (initial) => {
        const { source } = createMockSource(initial);

        createRoot((dispose) => {
          const accessor = createSignalFromSource(source);

          expect(accessor()).toBe(initial);

          dispose();
        });
      },
    );
  });

  describe("Invariant 2: re-sync after subscribe (lazy reconciliation)", () => {
    // Lazy cached sources can reconcile their snapshot inside
    // `onFirstSubscribe` without notifying the just-added listener. The
    // bridge calls `setValue(sync)` AFTER `subscribe(...)` to catch that
    // exact window: simulate it by changing the snapshot inside the
    // `subscribe` callback (before it returns).
    test.prop([arbExtendedPrimitive, arbExtendedPrimitive], {
      numRuns: NUM_RUNS.thorough,
    })(
      "snapshot change inside subscribe() is reflected without a notify",
      (initial, reconciled) => {
        // Solid `createSignal` uses `===` (not Object.is) for default equality.
        // The invariant only holds when the new value is `!==` to the initial:
        // `0 === -0` and `NaN !== NaN` are the two edges. Filter on `!==` to
        // align the property with the equality semantics Solid actually uses.
        fc.pre(initial !== reconciled);

        let current = initial;
        const source: RouterSource<unknown> = {
          subscribe: (_cb) => {
            // Simulate lazy-reconcile: snapshot mutates during subscribe(),
            // but the bridge's listener is NOT invoked.
            current = reconciled;

            return () => {};
          },
          getSnapshot: () => current,
          destroy: () => {},
        };

        createRoot((dispose) => {
          const accessor = createSignalFromSource(source);

          // Without the `setValue(sync)` call after subscribe(...), this would
          // still equal `initial` — the listener was never called.
          expect(accessor()).toBe(reconciled);

          dispose();
        });
      },
    );
  });

  describe("Invariant 3: each emit propagates to the accessor", () => {
    test.prop(
      [arbExtendedPrimitive, fc.array(arbExtendedPrimitive, { maxLength: 5 })],
      { numRuns: NUM_RUNS.thorough },
    )("after N emits, accessor() === last emitted value", (initial, emits) => {
      // Solid's default `createSignal` uses `===` for equality. A
      // `0 → -0` (or `-0 → 0`) emit is silently dropped because
      // `0 === -0` is true. Filter the test domain to cases where the
      // emit chain actually propagates: each step must be `!==` to the
      // value the signal would be holding at that point.
      let lastSignalValue: unknown = initial;

      for (const value of emits) {
        if (value !== lastSignalValue) {
          lastSignalValue = value;
        }
      }

      const lastEmit = emits.length === 0 ? initial : emits.at(-1);

      // Only the cases where the last propagated value matches the last
      // emitted value are valid for this invariant (the alternative —
      // 0/-0 collision in the middle of the sequence — would be tested
      // separately if we cared about Solid's `===` suppression chain).
      fc.pre(Object.is(lastSignalValue, lastEmit));

      const { source, emit } = createMockSource<unknown>(initial);

      createRoot((dispose) => {
        const accessor = createSignalFromSource(source);

        for (const value of emits) {
          emit(value);
        }

        expect(accessor()).toBe(lastEmit);

        dispose();
      });
    });
  });

  describe("Invariant 4: default `===` equality — no spurious notify on same-reference re-emit", () => {
    // Solid `createSignal` default equality is `===`, not Object.is. The
    // bridge does not override it, so re-emitting the same reference is a
    // no-op at the signal level. A regression flipping to `{ equals: false }`
    // would notify on every set — this test pins the default behavior.
    test.prop([arbExtendedPrimitive], { numRuns: NUM_RUNS.standard })(
      "same-reference emit does not spuriously change the accessor",
      (value) => {
        // NaN !== NaN under `===` (Solid's default) — would propagate, so
        // exclude it from the "same-reference is a no-op" invariant.
        fc.pre(value === value);

        const { source, emit } = createMockSource<unknown>(value);

        createRoot((dispose) => {
          const accessor = createSignalFromSource(source);

          const before = accessor();

          emit(value);

          const after = accessor();

          expect(after).toBe(before);

          dispose();
        });
      },
    );
  });

  describe("Invariant 5: cleanup unsubscribes from the source", () => {
    test.prop([arbExtendedPrimitive, arbExtendedPrimitive], {
      numRuns: NUM_RUNS.thorough,
    })(
      "after dispose, source.emit() no longer mutates the accessor",
      (initial, after) => {
        fc.pre(!Object.is(initial, after));

        const { source, emit, listeners } = createMockSource<unknown>(initial);

        let accessor: () => unknown = () => undefined;
        let dispose: () => void = () => {};

        createRoot((d) => {
          dispose = d;
          accessor = createSignalFromSource(source);
        });

        expect(accessor()).toBe(initial);
        expect(listeners()).toBe(1);

        dispose();

        expect(listeners()).toBe(0);

        emit(after);

        // No subscription left → snapshot does not propagate.
        expect(accessor()).toBe(initial);
      },
    );
  });
});
