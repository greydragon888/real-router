import { describe, expect, it } from "vitest";

import { distinctUntilChanged } from "../../../src/operators/distinctUntilChanged";
import { RxObservable } from "../../../src/RxObservable";

describe("distinctUntilChanged", () => {
  it("should filter consecutive duplicate values with default comparator", () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(2);
      observer.next?.(3);
      observer.next?.(1);
      observer.complete?.();

      return;
    });

    source.pipe(distinctUntilChanged()).subscribe({
      next: (v) => values.push(v),
    });

    expect(values).toStrictEqual([1, 2, 3, 1]);
  });

  it("should use custom comparator with (previous, current) order", () => {
    const values: number[] = [];
    const comparatorCalls: [number, number][] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);
      observer.complete?.();

      return;
    });

    source
      .pipe(
        distinctUntilChanged((prev, curr) => {
          comparatorCalls.push([prev, curr]);

          return prev === curr;
        }),
      )
      .subscribe({
        next: (v) => values.push(v),
      });

    expect(values).toStrictEqual([1, 2, 3]);
    expect(comparatorCalls).toStrictEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it("should handle non-commutative comparator correctly", () => {
    interface Version {
      major: number;
      minor: number;
    }

    const values: Version[] = [];

    const source = new RxObservable<Version>((observer) => {
      observer.next?.({ major: 1, minor: 0 });
      observer.next?.({ major: 1, minor: 1 });
      observer.next?.({ major: 2, minor: 0 });
      observer.next?.({ major: 1, minor: 5 });
      observer.complete?.();

      return;
    });

    source
      .pipe(distinctUntilChanged((prev, curr) => prev.major === curr.major))
      .subscribe({
        next: (v) => values.push(v),
      });

    expect(values).toStrictEqual([
      { major: 1, minor: 0 },
      { major: 2, minor: 0 },
      { major: 1, minor: 5 },
    ]);
  });

  it("should always emit first value", () => {
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(5);
      observer.next?.(5);
      observer.complete?.();

      return;
    });

    source.pipe(distinctUntilChanged()).subscribe({
      next: (v) => values.push(v),
    });

    expect(values).toStrictEqual([5]);
  });

  it("should handle unsubscribe correctly", async () => {
    const values: number[] = [];
    let emitFn: ((v: number) => void) | undefined;

    const source = new RxObservable<number>((observer) => {
      emitFn = (v) => observer.next?.(v);

      return;
    });

    const subscription = source.pipe(distinctUntilChanged()).subscribe({
      next: (v) => {
        values.push(v);
        if (v === 2) {
          subscription.unsubscribe();
        }
      },
    });

    emitFn?.(1);
    emitFn?.(2);
    emitFn?.(3);

    expect(values).toStrictEqual([1, 2]);
  });

  it("should propagate errors from source", async () => {
    const errors: unknown[] = [];
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => observer.error?.(new Error("source error")), 10);

      return;
    });

    source.pipe(distinctUntilChanged()).subscribe({
      next: (v) => values.push(v),
      error: (e) => errors.push(e),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(values).toStrictEqual([1]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("source error");
  });

  it("should propagate complete from source", () => {
    const completeCalls: number[] = [];
    const values: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.complete?.();

      return;
    });

    source.pipe(distinctUntilChanged()).subscribe({
      next: (v) => values.push(v),
      complete: () => completeCalls.push(1),
    });

    expect(values).toStrictEqual([1, 2]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should support multiple subscriptions", () => {
    const values1: number[] = [];
    const values2: number[] = [];

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(1);
      observer.next?.(2);
      observer.complete?.();

      return;
    });

    const piped = source.pipe(distinctUntilChanged());

    piped.subscribe({ next: (v) => values1.push(v) });
    piped.subscribe({ next: (v) => values2.push(v) });

    expect(values1).toStrictEqual([1, 2]);
    expect(values2).toStrictEqual([1, 2]);
  });
});
