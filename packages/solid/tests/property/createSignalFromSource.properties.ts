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
import { describe, expect, vi } from "vitest";

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

    // Sprint C.1 — explicit pin-test for the 0 / -0 dropout that
    // Invariant 3 above filters away via `fc.pre`. The bridge uses
    // Solid's default `createSignal` equality (`===`, not Object.is),
    // so emitting `-0` over a `0` (or vice versa) is silently
    // suppressed. Lock both directions: even after the source has
    // mutated its snapshot to `-0`, the accessor still reports `0`.
    // A regression that switched to Object.is equality (which DOES
    // distinguish `0` from `-0`) would surface here.
    test("0 → -0 emit is dropped by `===` equality (Solid signal default)", () => {
      const { source, emit } = createMockSource<number>(0);

      createRoot((dispose) => {
        const accessor = createSignalFromSource(source);

        expect(Object.is(accessor(), 0)).toBe(true);

        // Emit `-0`: getSnapshot now returns `-0`, but `0 === -0` is
        // true → signal does NOT update.
        emit(-0);

        // Accessor returns the OLD value (0), not the emitted -0.
        // Object.is distinguishes them: this assertion FAILS if the
        // bridge silently switched to Object.is equality.
        expect(Object.is(accessor(), 0)).toBe(true);
        expect(Object.is(accessor(), -0)).toBe(false);

        dispose();
      });
    });

    test("-0 → 0 emit is also dropped (symmetric)", () => {
      const { source, emit } = createMockSource<number>(-0);

      createRoot((dispose) => {
        const accessor = createSignalFromSource(source);

        expect(Object.is(accessor(), -0)).toBe(true);

        emit(0);

        // Symmetric: starting from -0, an emit of +0 also suppressed.
        expect(Object.is(accessor(), -0)).toBe(true);
        expect(Object.is(accessor(), 0)).toBe(false);

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
    test("getSnapshot() throw at init is CAUGHT — accessor defaults to undefined (Mini-sprint E.5)", () => {
      // Behaviour change: pre-E.5, an init-phase getSnapshot throw
      // bubbled up to the createRoot owner and tore down the entire
      // reactive subtree. Post-E.5, the bridge catches + logs + falls
      // back to `undefined` so the accessor still constructs; the
      // next emit refreshes the value. Documented in
      // createSignalFromSource.ts:9-17.
      const boom = new Error("snapshot boom");
      const source: RouterSource<unknown> = {
        subscribe: () => () => {},
        getSnapshot: () => {
          throw boom;
        },
        destroy: () => {},
      };

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      let accessor: (() => unknown) | undefined;

      expect(() => {
        createRoot((dispose) => {
          accessor = createSignalFromSource(source);
          dispose();
        });
      }).not.toThrow();

      // Init-phase fallback in action.
      expect(accessor).toBeDefined();
      // The defensive guard logged so the throw isn't silent.
      // (Two logs may fire — initial + post-subscribe re-sync.)
      expect(consoleError.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("getSnapshot threw"),
        boom,
      );

      consoleError.mockRestore();
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

  describe("Invariant 8: subscribe-then-emit ordering — value between subscribe and post-subscribe re-sync is NOT lost (Sprint B.5 — audit-6 Stage-2 #12)", () => {
    // Race window: the bridge does
    //   const unsubscribe = source.subscribe(() => setValue(sync));
    //   setValue(sync);   // ← post-subscribe re-sync
    // If a cached lazy source reconciles its snapshot synchronously
    // inside `subscribe()` (lazy onFirstSubscribe pattern), the
    // listener fires BEFORE `subscribe()` returns. The bridge's
    // explicit post-subscribe re-sync (`setValue(sync)`) is then a
    // no-op due to Solid's `===` equality. The accessor must
    // converge to the post-reconcile value regardless of which path
    // delivered it. This invariant pins both code paths.

    test("source emits synchronously inside subscribe() — accessor reflects post-emit snapshot", () => {
      let current = 1;
      const callbacks = new Set<() => void>();
      const source: RouterSource<number> = {
        subscribe: (cb) => {
          callbacks.add(cb);
          // Simulate lazy reconcile: bump value AND notify the
          // listener that was just registered.
          current = 99;
          cb();

          return () => {
            callbacks.delete(cb);
          };
        },
        getSnapshot: () => current,
        destroy: vi.fn(),
      };

      createRoot((dispose) => {
        const accessor = createSignalFromSource(source);

        // Initial getSnapshot saw `1`; subscribe-time reconcile
        // bumped to `99` AND notified the listener (which called
        // setValue(sync) → reads `99`). The accessor MUST reflect
        // the latest value, not the stale initial.
        expect(accessor()).toBe(99);

        dispose();
      });
    });

    test("source mutates state inside subscribe() WITHOUT notifying — post-subscribe re-sync catches it", () => {
      // Legacy / racy lazy source: mutates current snapshot during
      // `subscribe()` but does NOT call back the listener. The
      // bridge's explicit `setValue(sync)` after `subscribe()`
      // returns picks up the new value.
      let current = 5;
      const source: RouterSource<number> = {
        subscribe: () => {
          // Mutate snapshot but DON'T notify — silent reconcile.
          current = 42;

          return () => {
            /* no-op */
          };
        },
        getSnapshot: () => current,
        destroy: vi.fn(),
      };

      createRoot((dispose) => {
        const accessor = createSignalFromSource(source);

        // Initial getSnapshot returned `5` → signal value was `5`.
        // Inside subscribe(), source mutated to `42` but did NOT
        // notify. Post-subscribe `setValue(sync)` re-reads → `42`.
        expect(accessor()).toBe(42);

        dispose();
      });
    });
  });
});
