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
import { createRenderEffect, createRoot } from "solid-js";
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
    // would notify on every set — this test pins the default behavior via a
    // createRenderEffect-driven run counter (synchronous in Solid; an
    // accessor()-only check would NOT catch the regression because under
    // `{ equals: false }` accessor() still returns the same value, only the
    // notification frequency changes).
    test.prop([arbExtendedPrimitive], { numRuns: NUM_RUNS.standard })(
      "same-reference emit does not trigger reactive notifications",
      (value) => {
        // NaN !== NaN under `===` (Solid's default) — would propagate, so
        // exclude it from the "same-reference is a no-op" invariant.
        fc.pre(value === value);

        const { source, emit } = createMockSource<unknown>(value);

        createRoot((dispose) => {
          const accessor = createSignalFromSource(source);

          let runs = 0;

          createRenderEffect(() => {
            accessor();
            runs += 1;
          });

          // Baseline: createRenderEffect runs once synchronously on creation.
          expect(runs).toBe(1);

          emit(value);
          emit(value);
          emit(value);

          // Three same-reference emits must NOT add any reactive runs.
          // Under `{ equals: false }` this would be 4.
          expect(runs).toBe(1);

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

  describe("Invariant 6: error propagation from source (§5.7 edge-cases)", () => {
    // The bridge does NOT defensively wrap getSnapshot/subscribe in try/catch
    // — exceptions must bubble to the reactive owner unchanged. This is
    // intentional: a thrown source error is a contract violation, not a
    // recoverable runtime state, so swallowing it would hide bugs. Lock the
    // throw-through behaviour so a future defensive `try { … } catch { }`
    // refactor surfaces here.
    test("getSnapshot() throw at init bubbles up to createRoot owner", () => {
      const boom = new Error("snapshot boom");
      const source: RouterSource<unknown> = {
        subscribe: () => () => {},
        getSnapshot: () => {
          throw boom;
        },
        destroy: () => {},
      };

      expect(() => {
        createRoot((dispose) => {
          createSignalFromSource(source);
          dispose();
        });
      }).toThrow(boom);
    });

    test("subscribe() throw after createSignal is constructed bubbles up", () => {
      // The order in createSignalFromSource is: createSignal(getSnapshot())
      // FIRST, then source.subscribe(). A throw inside subscribe lands
      // mid-init — must propagate (not leak a partially-wired signal).
      const boom = new Error("subscribe boom");
      const source: RouterSource<unknown> = {
        subscribe: () => {
          throw boom;
        },
        getSnapshot: () => 0,
        destroy: () => {},
      };

      expect(() => {
        createRoot((dispose) => {
          createSignalFromSource(source);
          dispose();
        });
      }).toThrow(boom);
    });
  });

  describe("Invariant 7: double subscribe in one owner (§5.7 documented behaviour)", () => {
    // Calling createSignalFromSource(source) twice on the SAME source in the
    // SAME reactive owner is allowed and produces TWO independent listeners.
    // Sources contract guarantees fan-out support (Set/Map of callbacks in
    // BaseSource), so this is not a leak — just a per-call subscription.
    // Pin the answer so a future "dedupe by source identity" refactor does
    // NOT silently collapse two subscriptions into one (which would break
    // independent accessor lifetimes if one is disposed early).
    test("two calls on same source produce two independent listeners", () => {
      const { source, listeners } = createMockSource<number>(0);

      createRoot((dispose) => {
        const accessorA = createSignalFromSource(source);
        const accessorB = createSignalFromSource(source);

        expect(accessorA()).toBe(0);
        expect(accessorB()).toBe(0);
        // Both subscriptions live on the source's listener set.
        expect(listeners()).toBe(2);

        dispose();

        // Both cleaned up together when the shared owner disposes.
        expect(listeners()).toBe(0);
      });
    });
  });
});
