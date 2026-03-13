import { describe, it, expect } from "vitest";

import { createControllableSource, emitBurst } from "./helpers";
import { RxObservable, map, filter, distinctUntilChanged } from "../../src";

import type { Subscription } from "../../src";

describe("RX1: Subscribe/unsubscribe storm", () => {
  it("1.1: 500 × subscribe → emit 1 value → unsubscribe", () => {
    const { observable, emit } = createControllableSource<number>();
    let receivedCount = 0;

    for (let i = 0; i < 500; i++) {
      const sub = observable.subscribe({ next: () => receivedCount++ });

      emit(i);
      sub.unsubscribe();

      expect(sub.closed).toBe(true);
    }

    expect(receivedCount).toBe(500);
  });

  it("1.2: 500 × subscribe → unsubscribe without emit", () => {
    let teardownCount = 0;

    const observable = new RxObservable<number>(() => {
      return () => {
        teardownCount++;
      };
    });

    for (let i = 0; i < 500; i++) {
      const sub = observable.subscribe({ next: () => {} });

      sub.unsubscribe();

      expect(sub.closed).toBe(true);
    }

    expect(teardownCount).toBe(500);
  });

  it("1.3: 200 concurrent subscriptions → emit 100 values → unsubscribe all", () => {
    const { observable, emit } = createControllableSource<number>();
    const counts: number[] = [];
    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 200; i++) {
      counts.push(0);
      const idx = i;

      subscriptions.push(observable.subscribe({ next: () => counts[idx]++ }));
    }

    const values = Array.from({ length: 100 }, (_, i) => i);

    emitBurst(emit, values);

    for (const sub of subscriptions) {
      sub.unsubscribe();
    }

    for (const count of counts) {
      expect(count).toBe(100);
    }
  });

  it("1.4: 500 × subscribe → immediate unsubscribe (no emit)", () => {
    const { observable } = createControllableSource<number>();
    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 500; i++) {
      const sub = observable.subscribe({ next: () => {} });

      sub.unsubscribe();
      subscriptions.push(sub);
    }

    for (const sub of subscriptions) {
      expect(sub.closed).toBe(true);
    }
  });

  it("1.5: 200 × subscribe with AbortSignal → abort()", () => {
    const { observable } = createControllableSource<number>();
    const controllers: AbortController[] = [];
    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 200; i++) {
      const controller = new AbortController();

      controllers.push(controller);
      subscriptions.push(
        observable.subscribe({ next: () => {} }, { signal: controller.signal }),
      );
    }

    for (const controller of controllers) {
      controller.abort();
    }

    for (const sub of subscriptions) {
      expect(sub.closed).toBe(true);
    }
  });

  it("1.6: Re-subscription × 250 on one observable", () => {
    const { observable, emit } = createControllableSource<number>();
    const allValues: number[][] = [];

    for (let i = 0; i < 250; i++) {
      const values: number[] = [];
      const sub = observable.subscribe({ next: (v) => values.push(v) });

      emit(i);
      emit(i + 1);
      sub.unsubscribe();
      allValues.push(values);

      const sub2 = observable.subscribe({ next: (v) => values.push(v) });

      emit(i + 2);
      sub2.unsubscribe();
    }

    for (let i = 0; i < 250; i++) {
      expect(allValues[i]).toStrictEqual([i, i + 1, i + 2]);
    }
  });

  it("1.7: Reentrant unsubscribe from next callback × 200", () => {
    const { observable, emit } = createControllableSource<number>();
    const receivedCounts: number[] = [];

    for (let i = 0; i < 200; i++) {
      let count = 0;
      let sub: Subscription;

      sub = observable.subscribe({
        next: () => {
          count++;

          if (count >= 3) {
            sub.unsubscribe();
          }
        },
      });

      for (let v = 0; v < 10; v++) {
        emit(v);
      }

      receivedCounts.push(count);
      sub.unsubscribe();
    }

    for (const count of receivedCounts) {
      expect(count).toBe(3);
    }

    const piped = observable.pipe(
      map((x: number) => x * 2),
      filter((x) => x >= 0),
      distinctUntilChanged(),
    );

    const pipedCounts: number[] = [];

    for (let i = 0; i < 200; i++) {
      let count = 0;
      let sub: Subscription;

      sub = piped.subscribe({
        next: () => {
          count++;

          if (count >= 3) {
            sub.unsubscribe();
          }
        },
      });

      for (let v = 0; v < 10; v++) {
        emit(v);
      }

      pipedCounts.push(count);
      sub.unsubscribe();
    }

    for (const count of pipedCounts) {
      expect(count).toBe(3);
    }
  });

  it("1.timing: 500 subscribe/unsubscribe cycles complete in < 2 seconds", () => {
    const { observable, emit } = createControllableSource<number>();
    const start = performance.now();

    for (let i = 0; i < 500; i++) {
      const sub = observable.subscribe({ next: () => {} });

      emit(i);
      sub.unsubscribe();
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
  });
});
