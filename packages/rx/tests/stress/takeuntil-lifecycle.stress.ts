import { describe, it, expect, vi } from "vitest";

import { createControllableSource } from "./helpers";
import { RxObservable, takeUntil } from "../../src";

describe("RX5: takeUntil dual-subscription lifecycle", () => {
  it("5.1: 100 × takeUntil(notifier) → notifier emit → all subscriptions cleaned up, complete called 100 times", () => {
    let completedCount = 0;

    const pairs = Array.from({ length: 100 }, () => ({
      source: createControllableSource<number>(),
      notifier: createControllableSource<void>(),
    }));

    const subscriptions = pairs.map(({ source, notifier }) => {
      const sub = source.observable
        .pipe(takeUntil(notifier.observable))
        .subscribe({
          complete: () => {
            completedCount++;
          },
        });

      return sub;
    });

    for (const { notifier } of pairs) {
      notifier.emit();
    }

    expect(completedCount).toStrictEqual(100);

    for (const sub of subscriptions) {
      expect(sub.closed).toStrictEqual(true);
    }
  });

  it("5.2: 100 × takeUntil(notifier) → unsubscribe instead of notifier → source + notifier cleaned up", () => {
    const sourceCleanups: number[] = [];
    const notifierCleanups: number[] = [];

    const subscriptions = Array.from({ length: 100 }, () => {
      const notifier = new RxObservable<void>(() => {
        return () => {
          notifierCleanups.push(1);
        };
      });

      const source = new RxObservable<number>(() => {
        return () => {
          sourceCleanups.push(1);
        };
      });

      return source.pipe(takeUntil(notifier)).subscribe({});
    });

    for (const sub of subscriptions) {
      sub.unsubscribe();
    }

    expect(sourceCleanups).toHaveLength(100);
    expect(notifierCleanups).toHaveLength(100);

    for (const sub of subscriptions) {
      expect(sub.closed).toStrictEqual(true);
    }
  });

  it("5.3: takeUntil with sync notifier (emits in constructor) × 100 → source NEVER subscribed, complete called", () => {
    let completedCount = 0;
    const sourceSubscribeCounts: number[] = [];

    for (let i = 0; i < 100; i++) {
      const notifier = new RxObservable<string>((observer) => {
        observer.next?.("done");
      });

      const source = new RxObservable<number>((observer) => {
        sourceSubscribeCounts.push(1);
        observer.next?.(42);
      });

      source.pipe(takeUntil(notifier)).subscribe({
        complete: () => {
          completedCount++;
        },
      });
    }

    expect(completedCount).toStrictEqual(100);
    expect(sourceSubscribeCounts).toHaveLength(0);
  });

  it("5.4: 50 nested takeUntil: source.pipe(takeUntil(n1)).pipe(takeUntil(n2)) → n2 emit → complete, cleanup n1 chain", () => {
    let completedCount = 0;

    const pipelines = Array.from({ length: 50 }, () => ({
      source: createControllableSource<number>(),
      n1: createControllableSource<void>(),
      n2: createControllableSource<void>(),
    }));

    const subscriptions = pipelines.map(({ source, n1, n2 }) =>
      source.observable
        .pipe(takeUntil(n1.observable))
        .pipe(takeUntil(n2.observable))
        .subscribe({
          complete: () => {
            completedCount++;
          },
        }),
    );

    for (const { n2 } of pipelines) {
      n2.emit();
    }

    expect(completedCount).toStrictEqual(50);

    for (const sub of subscriptions) {
      expect(sub.closed).toStrictEqual(true);
    }
  });

  it("5.5: takeUntil race: notifier emit + source emit simultaneous × 100 → no double-complete", () => {
    const completeCounts: number[] = [];

    for (let i = 0; i < 100; i++) {
      let completeCount = 0;
      const source = createControllableSource<number>();
      const notifier = createControllableSource<void>();

      source.observable.pipe(takeUntil(notifier.observable)).subscribe({
        complete: () => {
          completeCount++;
        },
      });

      notifier.emit();
      source.emit(1);
      notifier.emit();
      source.emit(2);

      completeCounts.push(completeCount);
    }

    for (const count of completeCounts) {
      expect(count).toStrictEqual(1);
    }
  });

  it("5.6: 100 × takeUntil(notifier) → notifier emit → complete fires → explicit unsubscribe() is no-op", () => {
    const outerTeardownCounts: number[] = [];
    let completedCount = 0;

    for (let i = 0; i < 100; i++) {
      let teardownCallCount = 0;
      const notifier = createControllableSource<void>();

      const source = new RxObservable<number>(() => {
        return () => {
          teardownCallCount++;
        };
      });

      const sub = source.pipe(takeUntil(notifier.observable)).subscribe({
        complete: () => {
          completedCount++;
        },
      });

      notifier.emit();

      expect(sub.closed).toStrictEqual(true);
      expect(completedCount).toStrictEqual(i + 1);

      const teardownBefore = teardownCallCount;

      sub.unsubscribe();

      outerTeardownCounts.push(teardownCallCount - teardownBefore);
    }

    expect(completedCount).toStrictEqual(100);

    for (const count of outerTeardownCounts) {
      expect(count).toStrictEqual(0);
    }
  });

  it("5.timing: 1000 debounced emissions complete in < 3 seconds", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];

    vi.useFakeTimers();

    try {
      source.observable
        .pipe(takeUntil(new RxObservable<void>(() => {})))
        .subscribe({
          next: (v) => received.push(v),
        });

      const start = Date.now();

      for (let i = 1; i <= 1000; i++) {
        source.emit(i);
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
      expect(received).toHaveLength(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
