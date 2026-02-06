import { describe, it, expect } from "vitest";

import { RxObservable, debounceTime } from "../../../src";

describe("debounceTime()", () => {
  it("should debounce rapid emissions and emit only the last value", async () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      setTimeout(() => observer.complete?.(), 100);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(values).toStrictEqual([3]);
  });

  it("should emit multiple values if they are spaced apart", async () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => observer.next?.(2), 100);
      setTimeout(() => observer.next?.(3), 200);
      setTimeout(() => observer.complete?.(), 300);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
    });

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(values).toStrictEqual([1, 2, 3]);
  });

  it("should work with duration 0 (still async via setTimeout)", async () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      setTimeout(() => observer.complete?.(), 50);

      return;
    });

    source.pipe(debounceTime(0)).subscribe({
      next: (v) => values.push(v),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([3]);
  });

  it("should clear timeout on unsubscribe", async () => {
    const values: number[] = [];
    let emitFn: ((v: number) => void) | undefined;

    const source = new RxObservable<number>((observer) => {
      emitFn = (v) => observer.next?.(v);

      return;
    });

    const subscription = source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
    });

    emitFn?.(1);
    emitFn?.(2);

    subscription.unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([]);
  });

  it("should clear timeout on error", async () => {
    const values: number[] = [];
    const errors: unknown[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      setTimeout(() => observer.error?.(new Error("test error")), 30);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
      error: (e) => errors.push(e),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("test error");
  });

  it("should flush pending value on complete", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      setTimeout(() => observer.complete?.(), 30);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([2]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should propagate error from source", async () => {
    const errors: unknown[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => observer.error?.(new Error("source error")), 20);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      error: (e) => errors.push(e),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("source error");
  });

  it("should handle multiple rapid subscriptions", async () => {
    const values1: number[] = [];
    const values2: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      setTimeout(() => observer.complete?.(), 100);

      return;
    });

    const debounced = source.pipe(debounceTime(50));

    debounced.subscribe({
      next: (v) => values1.push(v),
    });

    debounced.subscribe({
      next: (v) => values2.push(v),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(values1).toStrictEqual([3]);
    expect(values2).toStrictEqual([3]);
  });

  it("should emit last value before complete", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      setTimeout(() => observer.complete?.(), 100);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(values).toStrictEqual([3]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should handle synchronous source", async () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      observer.complete?.();

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([3]);
  });

  it("should NOT flush if no pending value on complete", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => {
        observer.complete?.();
      }, 100);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => values.push(v),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(values).toStrictEqual([1]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should flush then complete in correct order", async () => {
    const events: string[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      setTimeout(() => observer.complete?.(), 30);

      return;
    });

    source.pipe(debounceTime(50)).subscribe({
      next: (v) => events.push(`next:${v}`),
      complete: () => events.push("complete"),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events).toStrictEqual(["next:2", "complete"]);
  });

  it("should not emit if hasValue is false when timeout fires", async () => {
    const values: number[] = [];
    let emitFn: ((v: number) => void) | undefined;

    const source = new RxObservable<number>((observer) => {
      emitFn = (v) => observer.next?.(v);

      return;
    });

    source.pipe(debounceTime(30)).subscribe({
      next: (v) => values.push(v),
    });

    emitFn?.(1);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(values).toStrictEqual([1]);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(values).toStrictEqual([1]);
  });

  describe("edge cases", () => {
    it("should handle error without prior emit (no pending timer)", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        // Error immediately without any next() calls
        observer.error?.(new Error("immediate error"));

        return;
      });

      source.pipe(debounceTime(50)).subscribe({
        error: (e) => errors.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("immediate error");
    });

    it("should handle unsubscribe without prior emit (no pending timer)", async () => {
      const values: number[] = [];

      const source = new RxObservable<number>(() => {
        // Don't emit anything
        return;
      });

      const subscription = source.pipe(debounceTime(50)).subscribe({
        next: (v) => values.push(v),
      });

      // Unsubscribe immediately without any emissions
      subscription.unsubscribe();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(values).toStrictEqual([]);
    });
  });

  describe("validation", () => {
    it("should throw RangeError on negative duration", () => {
      expect(() => {
        debounceTime(-100);
      }).toThrowError(
        new RangeError(
          "debounceTime: duration must be a non-negative finite number, got -100",
        ),
      );
    });

    it("should throw RangeError on NaN duration", () => {
      expect(() => {
        debounceTime(Number.NaN);
      }).toThrowError(
        new RangeError(
          "debounceTime: duration must be a non-negative finite number, got NaN",
        ),
      );
    });

    it("should throw RangeError on Infinity duration", () => {
      expect(() => {
        debounceTime(Number.POSITIVE_INFINITY);
      }).toThrowError(
        new RangeError(
          "debounceTime: duration must be a non-negative finite number, got Infinity",
        ),
      );
    });

    it("should accept zero duration", () => {
      expect(() => {
        debounceTime(0);
      }).not.toThrowError();
    });

    it("should accept positive finite duration", () => {
      expect(() => {
        debounceTime(100);
      }).not.toThrowError();
    });
  });
});
