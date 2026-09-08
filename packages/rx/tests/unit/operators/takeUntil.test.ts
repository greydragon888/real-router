import { describe, it, expect } from "vitest";

import { RxObservable, takeUntil } from "../../../src";

import type { Observer } from "../../../src";

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

  it("should release the notifier subscription when the notifier errors", () => {
    const notifierCleanups: number[] = [];
    let notifierErrorFn: ((error: Error) => void) | undefined;

    const notifier = new RxObservable<void>((observer) => {
      notifierErrorFn = (error) => observer.error?.(error);

      return () => notifierCleanups.push(1);
    });

    const source = new RxObservable<number>(() => {
      return () => {};
    });

    source.pipe(takeUntil(notifier)).subscribe({
      error: () => {},
    });

    notifierErrorFn?.(new Error("notifier error"));

    expect(notifierCleanups).toStrictEqual([1]);
  });

  it("should release the SOURCE subscription when the notifier errors after subscription", () => {
    let notifierErrorFn: ((error: Error) => void) | undefined;

    const notifier = new RxObservable<void>((observer) => {
      notifierErrorFn = (error) => observer.error?.(error);

      return () => {};
    });

    const sourceCleanups: number[] = [];
    const source = new RxObservable<number>(() => {
      return () => sourceCleanups.push(1);
    });

    source.pipe(takeUntil(notifier)).subscribe({ error: () => {} });

    // The notifier errors AFTER the source is subscribed, so the notifier-error
    // handler's `if (sourceSubscription) sourceSubscription.unsubscribe()` is the
    // ONLY thing that releases the source: error() is non-terminal, so the main
    // teardown never runs here (unlike complete(), which finalizes downstream).
    notifierErrorFn?.(new Error("notifier error"));

    expect(sourceCleanups).toStrictEqual([1]);
  });

  it("should release the notifier subscription when the notifier emits synchronously", () => {
    const notifierCleanups: number[] = [];

    const notifier = new RxObservable<void>((observer) => {
      observer.next?.();

      return () => notifierCleanups.push(1);
    });

    const source = new RxObservable<number>(() => {
      return () => {};
    });

    source.pipe(takeUntil(notifier)).subscribe({});

    expect(notifierCleanups).toStrictEqual([1]);
  });

  it("should release the source subscription when the source errors", () => {
    const sourceCleanups: number[] = [];
    let sourceErrorFn: ((error: Error) => void) | undefined;

    const notifier = new RxObservable<void>(() => {
      return () => {};
    });

    const source = new RxObservable<number>((observer) => {
      sourceErrorFn = (error) => observer.error?.(error);

      return () => sourceCleanups.push(1);
    });

    source.pipe(takeUntil(notifier)).subscribe({ error: () => {} });

    sourceErrorFn?.(new Error("source error"));

    // takeUntil sets completed=true on a source error and will never forward
    // another source value — so the now-inert source subscription must be
    // released, exactly as the notifier-emit / notifier-error branches do.
    expect(sourceCleanups).toStrictEqual([1]);
  });

  it("should release the source subscription when the source errors synchronously", () => {
    const sourceCleanups: number[] = [];

    const notifier = new RxObservable<void>(() => {
      return () => {};
    });

    // Source errors synchronously inside its own subscribe — sourceSubscription is
    // still unassigned in the error handler, so the post-subscribe block must release it.
    const source = new RxObservable<number>((observer) => {
      observer.error?.(new Error("sync source error"));

      return () => sourceCleanups.push(1);
    });

    source.pipe(takeUntil(notifier)).subscribe({ error: () => {} });

    expect(sourceCleanups).toStrictEqual([1]);
  });

  it("forwards only the first of two synchronous notifier errors", () => {
    // `error` is non-terminal at the RxObservable layer, so a notifier can call
    // it twice; takeUntil is inert after the first terminal and must not
    // forward the second. The notifier errors inside its own subscribe, so
    // `notifierSubscription` is still unassigned and cannot be released early
    // — the `if (completed)` guard is the only thing that drops the second.
    const seen: string[] = [];
    const source = new RxObservable<number>(() => () => {});
    const notifier = new RxObservable<number>((observer) => {
      observer.error?.(new Error("first"));
      observer.error?.(new Error("second"));

      return () => {};
    });

    source.pipe(takeUntil<number>(notifier)).subscribe({
      next: () => {},
      error: (error) => seen.push((error as Error).message),
    });

    expect(seen).toStrictEqual(["first"]);
  });

  it("forwards only the first of two synchronous source errors", () => {
    // Same shape on the source arm: the source errors inside its own subscribe,
    // so `sourceSubscription` is unassigned and the second error reaches the
    // handler with `completed` already true.
    const seen: string[] = [];
    const source = new RxObservable<number>((observer) => {
      observer.error?.(new Error("first"));
      observer.error?.(new Error("second"));

      return () => {};
    });
    const notifier = new RxObservable<number>(() => () => {});

    source.pipe(takeUntil<number>(notifier)).subscribe({
      next: () => {},
      error: (error) => seen.push((error as Error).message),
    });

    expect(seen).toStrictEqual(["first"]);
  });

  it("releases both subscriptions before it announces completion", () => {
    // The eager unsubscribes in complete() are not redundant with the returned
    // teardown: they run BEFORE `observer.complete?.()`, so a consumer's
    // complete handler never observes a still-open source or notifier.
    const order: string[] = [];
    let fire: Observer<number> | undefined;
    const source = new RxObservable<number>(
      () => () => order.push("source-td"),
    );
    const notifier = new RxObservable<number>((observer) => {
      fire = observer;

      return () => order.push("notifier-td");
    });

    source
      .pipe(takeUntil<number>(notifier))
      .subscribe({ next: () => {}, complete: () => order.push("complete") });

    fire?.next?.(1);

    expect(order).toStrictEqual(["source-td", "notifier-td", "complete"]);
  });

  it("releases the notifier when the SOURCE errors", () => {
    // The source-error arm releases both. Its sibling arms are covered; this
    // one is the notifier release on that path.
    const order: string[] = [];
    let push: Observer<number> | undefined;
    const source = new RxObservable<number>((observer) => {
      push = observer;

      return () => order.push("source-td");
    });
    const notifier = new RxObservable<number>(
      () => () => order.push("notifier-td"),
    );

    source
      .pipe(takeUntil<number>(notifier))
      .subscribe({ next: () => {}, error: () => order.push("error") });

    push?.error?.(new Error("boom"));

    expect(order).toStrictEqual(["source-td", "notifier-td", "error"]);
  });

  it("drops a source value that arrives after a non-terminal source error", () => {
    // `error` does not close an RxObservable, and a source erroring inside its
    // own subscribe leaves `sourceSubscription` unassigned, so nothing
    // unsubscribed it. The `if (!completed)` gate is what drops the late value.
    const seen: number[] = [];
    const source = new RxObservable<number>((observer) => {
      observer.error?.(new Error("boom"));
      observer.next?.(1);

      return () => {};
    });
    const notifier = new RxObservable<number>(() => () => {});

    source
      .pipe(takeUntil<number>(notifier))
      .subscribe({ next: (value) => seen.push(value), error: () => {} });

    expect(seen).toStrictEqual([]);
  });
});
