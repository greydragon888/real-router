import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createControllableSource } from "./helpers";
import { debounceTime } from "../../src";

describe("RX4: debounceTime timer churn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("4.1: 1000 sync emissions → debounceTime(50) → exactly 1 emitted value = last", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];

    source.observable.pipe(debounceTime(50)).subscribe({
      next: (v) => received.push(v),
    });

    for (let i = 1; i <= 1000; i++) {
      source.emit(i);
    }

    vi.advanceTimersByTime(50);

    expect(received).toStrictEqual([1000]);
  });

  it("4.2: 5 bursts × 200 emissions with 100ms pause → debounceTime(50) → 5 values", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];

    source.observable.pipe(debounceTime(50)).subscribe({
      next: (v) => received.push(v),
    });

    for (let burst = 0; burst < 5; burst++) {
      const start = burst * 200 + 1;
      const end = start + 199;

      for (let i = start; i <= end; i++) {
        source.emit(i);
      }

      vi.advanceTimersByTime(100);
    }

    const expectedLastValues = [200, 400, 600, 800, 1000];

    expect(received).toStrictEqual(expectedLastValues);
  });

  it("4.3: debounceTime(0) × 1000 sync emissions → 1 emitted (still async)", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];

    source.observable.pipe(debounceTime(0)).subscribe({
      next: (v) => received.push(v),
    });

    for (let i = 1; i <= 1000; i++) {
      source.emit(i);
    }

    expect(received).toStrictEqual([]);

    vi.advanceTimersByTime(0);

    expect(received).toStrictEqual([1000]);
  });

  it("4.4: 50 concurrent subscriptions × debounceTime(50) × 100 sync emissions → each got 1 value", () => {
    const source = createControllableSource<number>();
    const receivedPerSub: number[][] = [];

    for (let s = 0; s < 50; s++) {
      const values: number[] = [];

      receivedPerSub.push(values);
      source.observable.pipe(debounceTime(50)).subscribe({
        next: (v) => values.push(v),
      });
    }

    for (let i = 1; i <= 100; i++) {
      source.emit(i);
    }

    vi.advanceTimersByTime(50);

    for (const values of receivedPerSub) {
      expect(values).toStrictEqual([100]);
    }
  });

  it("4.5: debounceTime(50) × 500 emissions → unsubscribe before timeout → 0 emitted", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];

    const subscription = source.observable.pipe(debounceTime(50)).subscribe({
      next: (v) => received.push(v),
    });

    for (let i = 1; i <= 500; i++) {
      source.emit(i);
    }

    subscription.unsubscribe();

    vi.advanceTimersByTime(100);

    expect(received).toStrictEqual([]);
  });

  it("4.6: debounceTime(50) × 100 emissions → complete before timeout → 1 value flushed + complete", () => {
    const source = createControllableSource<number>();
    const received: number[] = [];
    let completeCalled = 0;

    source.observable.pipe(debounceTime(50)).subscribe({
      next: (v) => received.push(v),
      complete: () => {
        completeCalled++;
      },
    });

    for (let i = 1; i <= 100; i++) {
      source.emit(i);
    }

    source.complete();

    expect(received).toStrictEqual([100]);
    expect(completeCalled).toStrictEqual(1);
  });

  it("4.7: 1000 × emit→error interleave → each error clears the pending timer (no orphan flush), error is non-terminal", () => {
    const { observable, emit, error } = createControllableSource<number>();
    const emitted: number[] = [];
    let errorsSeen = 0;

    const sub = observable.pipe(debounceTime(50)).subscribe({
      next: (v) => emitted.push(v),
      error: () => {
        errorsSeen += 1;
      },
    });

    for (let i = 0; i < 1000; i++) {
      emit(i); // arms the debounce timer
      error(new Error("boom")); // must clear it (no flush) and forward (non-terminal)
      vi.advanceTimersByTime(60); // an un-cleared timer would fire here
    }

    // Every error is forwarded (non-terminal) and no debounced value leaks: each
    // error cleared its pending timer before it could fire. Leak (no clearTimeout
    // on error): all 1000 values orphan-flush.
    expect(errorsSeen).toBe(1000);
    expect(emitted).toStrictEqual([]);

    // error is non-terminal — the operator keeps debouncing afterwards.
    emit(999);
    vi.advanceTimersByTime(60);

    expect(emitted).toStrictEqual([999]);
    expect(sub.closed).toBe(false);

    sub.unsubscribe();
  });
});
