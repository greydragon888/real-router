import { describe, it, expect } from "vitest";

import { RxObservable, takeUntil } from "../../../src";

describe("takeUntil()", () => {
  it("should complete when notifier emits", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 50);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      let i = 0;
      const interval = setInterval(() => {
        observer.next?.(i++);
      }, 10);

      return () => {
        clearInterval(interval);
      };
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThan(10);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should handle synchronous notifier (emits immediately)", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      observer.next?.();

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.next?.(3);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(values).toStrictEqual([]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should cleanup both subscriptions", async () => {
    const sourceCleanups: number[] = [];
    const notifierCleanups: number[] = [];

    const notifier = new RxObservable<void>(() => {
      return () => notifierCleanups.push(1);
    });

    const source = new RxObservable<number>(() => {
      return () => sourceCleanups.push(1);
    });

    const subscription = source.pipe(takeUntil(notifier)).subscribe({});

    subscription.unsubscribe();

    expect(sourceCleanups).toStrictEqual([1]);
    expect(notifierCleanups).toStrictEqual([1]);
  });

  it("should propagate error from notifier", async () => {
    const errors: unknown[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.error?.(new Error("notifier error")), 30);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      let i = 0;
      const interval = setInterval(() => {
        observer.next?.(i++);
      }, 10);

      return () => {
        clearInterval(interval);
      };
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: (error) => errors.push(error),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("notifier error");
  });

  it("should propagate error from source", async () => {
    const errors: unknown[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 100);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => observer.error?.(new Error("source error")), 30);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: (error) => errors.push(error),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("source error");
  });

  it("should complete in source before notifier", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 100);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.complete?.();

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(values).toStrictEqual([1, 2]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should emit values before notifier emits", async () => {
    const values: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 50);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      setTimeout(() => observer.next?.(2), 20);
      setTimeout(() => observer.next?.(3), 40);
      setTimeout(() => observer.next?.(4), 60);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values).toStrictEqual([1, 2, 3]);
  });

  it("should handle unsubscribe before notifier emits", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 100);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      let i = 0;
      const interval = setInterval(() => {
        observer.next?.(i++);
      }, 10);

      return () => {
        clearInterval(interval);
      };
    });

    const subscription = source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    subscription.unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThan(5);
  });

  it("should not emit after notifier emits", async () => {
    const values: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 50);

      return;
    });

    let emitFn: ((value: number) => void) | undefined;

    const source = new RxObservable<number>((observer) => {
      emitFn = (value) => observer.next?.(value);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
    });

    emitFn?.(1);

    await new Promise((resolve) => setTimeout(resolve, 100));

    emitFn?.(2);

    expect(values).toStrictEqual([1]);
  });

  it("should handle multiple subscriptions independently", async () => {
    const values1: number[] = [];
    const values2: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      setTimeout(() => observer.next?.(), 50);

      return;
    });

    const source = new RxObservable<number>((observer) => {
      let i = 0;
      const interval = setInterval(() => {
        observer.next?.(i++);
      }, 10);

      return () => {
        clearInterval(interval);
      };
    });

    const piped = source.pipe(takeUntil(notifier));

    piped.subscribe({
      next: (value) => values1.push(value),
    });

    piped.subscribe({
      next: (value) => values2.push(value),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(values1.length).toBeGreaterThan(0);
    expect(values2.length).toBeGreaterThan(0);
  });

  it("should handle notifier that never emits", async () => {
    const values: number[] = [];
    const completeCalls: number[] = [];

    const notifier = new RxObservable<void>(() => {
      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.next?.(2);
      observer.complete?.();

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      next: (value) => values.push(value),
      complete: () => completeCalls.push(1),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(values).toStrictEqual([1, 2]);
    expect(completeCalls).toStrictEqual([1]);
  });

  it("should ignore source error after notifier completes", async () => {
    const errors: unknown[] = [];
    let sourceErrorFn: ((error: Error) => void) | undefined;
    let notifierEmitFn: (() => void) | undefined;

    const notifier = new RxObservable<void>((observer) => {
      notifierEmitFn = () => {
        observer.next?.();
      };

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);
      sourceErrorFn = (error) => observer.error?.(error);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: (error) => errors.push(error),
    });

    notifierEmitFn?.();

    await new Promise((resolve) => setTimeout(resolve, 10));

    sourceErrorFn?.(new Error("source error"));

    expect(errors).toStrictEqual([]);
  });

  it("should handle synchronous notifier error (before source subscribed)", async () => {
    const errors: unknown[] = [];
    const sourceSubscribeCalls: number[] = [];

    // Notifier throws error synchronously during subscribe
    const notifier = new RxObservable<void>((observer) => {
      observer.error?.(new Error("sync notifier error"));

      return;
    });

    const source = new RxObservable<number>((observer) => {
      sourceSubscribeCalls.push(1);
      observer.next?.(1);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: (error) => errors.push(error),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("sync notifier error");
    // Source should never be subscribed because notifier errored first
    expect(sourceSubscribeCalls).toStrictEqual([]);
  });

  it("should ignore notifier error after notifier already emitted", async () => {
    const errors: unknown[] = [];
    let notifierErrorFn: ((error: Error) => void) | undefined;

    const notifier = new RxObservable<void>((observer) => {
      notifierErrorFn = (error) => observer.error?.(error);
      observer.next?.();

      return;
    });

    const source = new RxObservable<number>((observer) => {
      observer.next?.(1);

      return;
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: (error) => errors.push(error),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    notifierErrorFn?.(new Error("notifier error"));

    expect(errors).toStrictEqual([]);
  });
});
