// @vitest-environment jsdom
// packages/angular/tests/property/sourceToSignal.properties.ts

/**
 * Property-based tests for `sourceToSignal` from `packages/angular/src/`.
 *
 * Closes audit-2026-05-16 §6.2 invariant 5 (HIGH):
 *
 *   1. After `sourceToSignal(source)`, `signal()` returns
 *      `source.getSnapshot()` immediately — the initial value is seeded.
 *   2. Each emit (source subscribe callback) maps to exactly one `signal.set`
 *      call (no batching, no skip).
 *   3. After the injection context is destroyed (`DestroyRef.onDestroy`), the
 *      source receives `destroy()` exactly once and no further emits leak.
 *
 * Uses jsdom + Angular `TestBed` for the injection context — the bridge
 * itself is pure, but it depends on `inject(DestroyRef)` which only works
 * inside an Injector.
 */

import {
  EnvironmentInjector,
  createEnvironmentInjector,
  runInInjectionContext,
  signal as ngSignal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, beforeAll } from "vitest";

import { NUM_RUNS } from "./helpers";
import { sourceToSignal } from "../../src/sourceToSignal.js";

import type { RouterSource } from "@real-router/sources";

function createInstrumentedSource<T>(initial: T): RouterSource<T> & {
  emit: (value: T) => void;
  readonly destroyCount: number;
  readonly subscribeCount: number;
  readonly unsubscribeCount: number;
} {
  let current = initial;
  let listener: (() => void) | null = null;
  let destroyCount = 0;
  let subscribeCount = 0;
  let unsubscribeCount = 0;

  return {
    getSnapshot: () => current,
    subscribe: (fn: () => void) => {
      subscribeCount++;
      listener = fn;

      return () => {
        unsubscribeCount++;
        listener = null;
      };
    },
    destroy: () => {
      destroyCount++;
    },
    emit: (value: T) => {
      current = value;
      listener?.();
    },
    get destroyCount() {
      return destroyCount;
    },
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

/**
 * Each iteration creates a fresh child `EnvironmentInjector`. Its `DestroyRef`
 * fires when we call `.destroy()` on the injector — that's the cleanest way
 * to observe the cleanup contract without resetting the TestBed (which
 * destabilises shared module state across fast-check shrinks).
 */
function withFreshInjector<R>(
  rootInjector: EnvironmentInjector,
  body: (injector: EnvironmentInjector) => R,
): R {
  const child = createEnvironmentInjector([], rootInjector);

  try {
    return body(child);
  } finally {
    child.destroy();
  }
}

describe("sourceToSignal — Property Tests (audit §6.2 #5 HIGH)", () => {
  let root: EnvironmentInjector;

  beforeAll(() => {
    TestBed.configureTestingModule({});
    root = TestBed.inject(EnvironmentInjector);
  });

  describe("Invariant 1: initial signal value === source.getSnapshot()", () => {
    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.thorough,
    })("seed snapshot is visible on the very first signal read", (initial) => {
      const source = createInstrumentedSource(initial);

      withFreshInjector(root, (injector) => {
        runInInjectionContext(injector, () => {
          const sig = sourceToSignal(source);

          expect(sig()).toBe(initial);
          // Bridge subscribes eagerly — exactly one subscribe call, no early
          // teardown.
          expect(source.subscribeCount).toBe(1);
          expect(source.unsubscribeCount).toBe(0);
        });
      });
    });

    test.prop(
      [
        fc.record({
          x: fc.integer(),
          y: fc.string({ maxLength: 8 }),
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("seed snapshot preserves object identity", (initial) => {
      const source = createInstrumentedSource<{ x: number; y: string }>(
        initial,
      );

      withFreshInjector(root, (injector) => {
        runInInjectionContext(injector, () => {
          const sig = sourceToSignal(source);

          expect(sig()).toBe(initial);
        });
      });
    });
  });

  describe("Invariant 2: 1 emit → 1 signal update", () => {
    test.prop(
      [
        fc.integer({ min: -1000, max: 1000 }),
        fc.array(fc.integer({ min: -1000, max: 1000 }), {
          minLength: 1,
          maxLength: 12,
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "after N emits, signal reflects the last emitted value",
      (initial, emits) => {
        const source = createInstrumentedSource(initial);

        withFreshInjector(root, (injector) => {
          runInInjectionContext(injector, () => {
            const sig = sourceToSignal(source);

            for (const value of emits) {
              source.emit(value);
            }

            expect(sig()).toBe(emits.at(-1));
          });
        });
      },
    );

    test.prop(
      [
        fc.array(fc.integer({ min: -1000, max: 1000 }), {
          minLength: 1,
          maxLength: 8,
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "signal reads in lockstep with emits — every intermediate value observable via read-after-emit",
      (emits) => {
        const source = createInstrumentedSource(emits[0]);

        withFreshInjector(root, (injector) => {
          runInInjectionContext(injector, () => {
            const sig = sourceToSignal(source);
            const observed: number[] = [sig()];

            for (let i = 1; i < emits.length; i++) {
              source.emit(emits[i]);
              observed.push(sig());
            }

            expect(observed).toStrictEqual(emits);
          });
        });
      },
    );
  });

  describe("Invariant 3: cleanup — destroy() called once, no leaks after teardown", () => {
    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "injector.destroy() triggers source.destroy() exactly once and source.unsubscribeCount === 1",
      (initial) => {
        const source = createInstrumentedSource(initial);
        const injector = createEnvironmentInjector([], root);

        runInInjectionContext(injector, () => {
          sourceToSignal(source);
        });

        expect(source.destroyCount).toBe(0);

        injector.destroy();

        expect(source.destroyCount).toBe(1);
        expect(source.unsubscribeCount).toBe(1);
      },
    );

    test.prop(
      [fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 5 })],
      { numRuns: NUM_RUNS.standard },
    )(
      "post-destroy emits do NOT update the signal (subscription is released)",
      (initial, postDestroyEmits) => {
        const source = createInstrumentedSource(initial);
        const injector = createEnvironmentInjector([], root);
        let sig!: ReturnType<typeof sourceToSignal<number>>;

        runInInjectionContext(injector, () => {
          sig = sourceToSignal(source);
        });

        const snapshotBeforeDestroy = sig();

        injector.destroy();

        for (let i = 0; i < postDestroyEmits; i++) {
          source.emit(initial + i + 1);
        }

        expect(sig()).toBe(snapshotBeforeDestroy);
      },
    );
  });

  describe("sanity: signal is read-only (asReadonly)", () => {
    test("returned signal exposes only the read API — there is no `.set` method on the readonly handle", () => {
      const source = createInstrumentedSource(1);

      withFreshInjector(root, (injector) => {
        runInInjectionContext(injector, () => {
          const sig = sourceToSignal(source);

          expect((sig as unknown as { set?: unknown }).set).toBeUndefined();
          expect(
            (sig as unknown as { update?: unknown }).update,
          ).toBeUndefined();

          const writable = ngSignal(0);

          expect(typeof writable.set).toBe("function");
        });
      });
    });
  });
});
