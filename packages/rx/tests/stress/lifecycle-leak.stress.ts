import { describe, it, expect, vi } from "vitest";

import { RxObservable, takeUntil } from "../../src";

import type { Subscription } from "../../src";

/**
 * RX9 — resource-leak under repetition.
 *
 * RX1–RX8 are throughput/timing/count tests; none measures whether a long-lived
 * shared resource (an AbortSignal, a reused notifier) accumulates listeners or
 * live subscriptions across many short-lived consumers. That is exactly where
 * the #772 (abort listener leaked on `complete()`) and #773 (notifier
 * subscription leaked on the error / sync-emit path) bugs lived.
 *
 * Each test counts net registrations on the shared resource (deterministic, no
 * heap/GC noise). Discriminating power is validated mutationally: reverting the
 * guarded fix turns the exact assertion red (see the commit/PR notes).
 */
describe("RX9: Lifecycle / resource-leak under repetition", () => {
  it("9.1: 2000 completing subscriptions on one shared AbortSignal → no leaked abort listeners", () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    let complete: (() => void) | undefined;
    const source = new RxObservable<number>((observer) => {
      complete = () => observer.complete?.();

      return () => {};
    });

    for (let i = 0; i < 2000; i++) {
      source.subscribe({}, { signal: controller.signal });
      complete?.();
    }

    const added = addSpy.mock.calls.filter((c) => c[0] === "abort").length;
    const removed = removeSpy.mock.calls.filter((c) => c[0] === "abort").length;

    // Every completed stream releases its abort listener via finalize(); a
    // long-lived shared signal must not accumulate one listener per stream.
    // Healthy: added === removed === 2000. Leak (#772, no finalize on
    // complete): removed === 0, net === 2000.
    expect(added).toBe(2000);
    expect(removed).toBe(2000);
  });

  it("9.2: 1000 takeUntil() with an erroring notifier → the notifier subscription is released every time", () => {
    let notifierTeardowns = 0;
    let fail: (() => void) | undefined;

    const notifier = new RxObservable<void>((observer) => {
      fail = () => observer.error?.(new Error("boom"));

      return () => {
        notifierTeardowns += 1;
      };
    });
    const source = new RxObservable<number>(() => () => {});

    for (let i = 0; i < 1000; i++) {
      source.pipe(takeUntil(notifier)).subscribe({ error: () => {} });
      fail?.();
    }

    // The notifier-error branch must unsubscribe the notifier; otherwise every
    // takeUntil leaves a live notifier subscription dangling (e.g. 7 events$
    // listeners on the router bus). Healthy: 1000. Leak (#773): 0.
    expect(notifierTeardowns).toBe(1000);
  });

  it("9.3: 2000 cycles of mixed complete/unsubscribe terminals → teardown runs exactly once each", () => {
    let teardowns = 0;
    let complete: (() => void) | undefined;

    const source = new RxObservable<number>((observer) => {
      complete = () => observer.complete?.();

      return () => {
        teardowns += 1;
      };
    });

    const sequences: ("complete" | "unsubscribe")[][] = [
      ["complete"],
      ["unsubscribe"],
      ["complete", "unsubscribe"],
      ["unsubscribe", "complete"],
      ["complete", "complete"],
      ["unsubscribe", "unsubscribe"],
    ];

    for (let i = 0; i < 2000; i++) {
      const sequence = sequences[i % sequences.length];
      const sub: Subscription = source.subscribe({});

      for (const op of sequence) {
        if (op === "complete") {
          complete?.();
        } else {
          sub.unsubscribe();
        }
      }
    }

    // Each cycle terminates the subscription; teardown must run exactly once
    // regardless of which terminal fired first or how many followed. Healthy:
    // 2000. Leak (#772, complete skips teardown): complete-first cycles
    // contribute 0, total drops to ~1000.
    expect(teardowns).toBe(2000);
  });

  it("9.4: 1000 sync-throwing subscriptions on a shared AbortSignal → unsubscribe clears every abort listener", () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    const source = new RxObservable<number>(() => {
      throw new Error("sync throw");
    });

    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 1000; i++) {
      // A synchronous throw is non-terminal (closed stays false), so the abort
      // listener registered before subscribeFn ran is still live afterwards —
      // it must not be stranded on the shared signal.
      subscriptions.push(
        source.subscribe({ error: () => {} }, { signal: controller.signal }),
      );
    }

    const addedBefore = addSpy.mock.calls.filter(
      (c) => c[0] === "abort",
    ).length;
    const removedBefore = removeSpy.mock.calls.filter(
      (c) => c[0] === "abort",
    ).length;

    expect(addedBefore).toBe(1000);
    expect(removedBefore).toBe(0);

    for (const sub of subscriptions) {
      sub.unsubscribe();
    }

    const removedAfter = removeSpy.mock.calls.filter(
      (c) => c[0] === "abort",
    ).length;

    // unsubscribe() runs finalize() and removes the abort listener even after a
    // throwing subscribeFn left the subscription open. Healthy: 1000. Leak (no
    // abort removal in finalize): 0.
    expect(removedAfter).toBe(1000);
  });
});
