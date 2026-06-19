import { describe, it, expect } from "vitest";

import { createControllableSource } from "./helpers";
import { RxObservable } from "../../src";

describe("RX6: Symbol.asyncIterator backpressure", () => {
  it("6.1: Rapid producer: 500 emissions during one yield suspension → consumer got ≤ 3 values", async () => {
    const { observable, emit, complete } = createControllableSource<number>();
    const values: number[] = [];

    const iteratorPromise = (async () => {
      for await (const value of observable) {
        values.push(value);

        if (values.length === 1) {
          for (let i = 1; i <= 500; i++) {
            emit(i);
          }
        }

        if (values.length >= 2) {
          complete();
        }
      }
    })();

    emit(0);
    await iteratorPromise;

    expect(values.length).toBeLessThanOrEqual(3);
    expect(values[0]).toStrictEqual(0);
  });

  it("6.2: Slow consumer: 100 values in 10 batches × 10, consumer processes between batches → ≤ 12 values", async () => {
    const { observable, emit, complete } = createControllableSource<number>();
    const values: number[] = [];

    const iteratorPromise = (async () => {
      for await (const value of observable) {
        values.push(value);

        await Promise.resolve();
      }
    })();

    for (let batch = 0; batch < 10; batch++) {
      for (let i = 0; i < 10; i++) {
        emit(batch * 10 + i);
      }

      await Promise.resolve();
    }

    complete();
    await iteratorPromise;

    expect(values.length).toBeLessThanOrEqual(12);
  });

  it("6.3: 50 concurrent iterators, break after 3 values each → all 50 iterators cleaned up", async () => {
    let activeSubscriptions = 0;
    const nextFns: ((v: number) => void)[] = [];

    const observable = new RxObservable<number>((observer) => {
      activeSubscriptions++;

      const notifyNext = (v: number) => {
        observer.next?.(v);
      };

      nextFns.push(notifyNext);

      return () => {
        activeSubscriptions--;

        const idx = nextFns.indexOf(notifyNext);

        if (idx !== -1) {
          nextFns.splice(idx, 1);
        }
      };
    });

    const allDone = Promise.all(
      Array.from({ length: 50 }, async () => {
        let count = 0;

        // eslint-disable-next-line sonarjs/no-unused-vars
        for await (const _value of observable) {
          count++;

          if (count >= 3) {
            break;
          }
        }
      }),
    );

    for (let i = 0; i < 5; i++) {
      for (const fn of nextFns) {
        fn(i);
      }

      await Promise.resolve();
    }

    await allDone;

    expect(activeSubscriptions).toStrictEqual(0);
  });

  it("6.4: 50 iterators + error mid-stream → all 50 iterators catch the error, subscriptions cleaned up", async () => {
    const source = createControllableSource<number>();
    let cleanupCount = 0;

    const observable = new RxObservable<number>((observer) => {
      const sub = source.observable.subscribe(observer);

      return () => {
        cleanupCount++;
        sub.unsubscribe();
      };
    });

    const errors: unknown[] = [];

    const allDone = Promise.all(
      Array.from({ length: 50 }, async () => {
        try {
          // eslint-disable-next-line no-empty, sonarjs/no-unused-vars
          for await (const _value of observable) {
          }
        } catch (error) {
          errors.push(error);
        }
      }),
    );

    source.emit(1);
    source.emit(2);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    source.error(new Error("test"));

    await allDone;

    expect(errors).toHaveLength(50);

    expect(cleanupCount).toStrictEqual(50);

    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("6.5: 50 iterators + complete mid-stream → all 50 iterators finish cleanly", async () => {
    const { observable, emit, complete } = createControllableSource<number>();
    const receivedCounts: number[] = [];
    let finishedCount = 0;

    const allDone = Promise.all(
      Array.from({ length: 50 }, async () => {
        let count = 0;

        // eslint-disable-next-line sonarjs/no-unused-vars
        for await (const _value of observable) {
          count++;
        }

        receivedCounts.push(count);
        finishedCount++;
      }),
    );

    emit(1);
    emit(2);
    await Promise.resolve();
    complete();

    await allDone;

    expect(finishedCount).toStrictEqual(50);

    for (const count of receivedCounts) {
      // Liveness: no iterator is starved. Upper bound catches duplicate delivery —
      // only two values are emitted before complete(), so a count above 2 means a
      // value was re-yielded (latest-wins collapses them to a single yield here).
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("6.7: 50 iterators over a value + synchronous complete → every iterator yields the terminal value", async () => {
    // The value and the complete() both fire synchronously inside subscribeFn,
    // before the for-await loop runs — the terminal batch must still be drained.
    const source = new RxObservable<number>((observer) => {
      observer.next?.(42);
      observer.complete?.();
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const got: number[] = [];

        for await (const value of source) {
          got.push(value);
        }

        return got;
      }),
    );

    for (const got of results) {
      expect(got).toStrictEqual([42]);
    }
  });

  it("6.8: 50 iterators over a synchronous error → every iterator throws", async () => {
    const source = new RxObservable<number>((observer) => {
      observer.error?.(new Error("sync iter error"));
    });

    const outcomes = await Promise.all(
      Array.from({ length: 50 }, async () => {
        try {
          // eslint-disable-next-line sonarjs/no-unused-vars
          for await (const _value of source) {
            // never runs — the source errors synchronously
          }

          return "completed";
        } catch (error) {
          return (error as Error).message;
        }
      }),
    );

    for (const outcome of outcomes) {
      expect(outcome).toBe("sync iter error");
    }
  });
});
