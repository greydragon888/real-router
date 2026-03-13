import { describe, it, expect, vi } from "vitest";

import { createControllableSource, emitBurst } from "./helpers";
import { map, filter } from "../../src";

import type { Subscription } from "../../src";

describe("RX8: Error cascade under load", () => {
  it("8.1: 500 emissions, each next throws → error handler called 500 times, subscription stays open", () => {
    const { observable, emit } = createControllableSource<number>();
    let errorCount = 0;

    const sub = observable.subscribe({
      next: () => {
        throw new Error("boom");
      },
      error: () => {
        errorCount++;
      },
    });

    const values = Array.from({ length: 500 }, (_, i) => i);

    emitBurst(emit, values);

    expect(errorCount).toBe(500);
    expect(sub.closed).toBe(false);

    sub.unsubscribe();
  });

  it("8.2: 500 emissions, error handler also throws → all caught silently", () => {
    const { observable, emit } = createControllableSource<number>();
    let nextCallCount = 0;

    const sub = observable.subscribe({
      next: () => {
        nextCallCount++;

        throw new Error("next-boom");
      },
      error: () => {
        throw new Error("error-boom");
      },
    });

    const values = Array.from({ length: 500 }, (_, i) => i);

    emitBurst(emit, values);

    expect(nextCallCount).toBe(500);
    expect(sub.closed).toBe(false);

    sub.unsubscribe();
  });

  it("8.3: 100 subscriptions, each throws from 5th value → 4 values + 6 errors", () => {
    const { observable, emit } = createControllableSource<number>();
    const results: { values: number; errors: number }[] = [];
    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 100; i++) {
      let valueCount = 0;
      let errorCount = 0;

      subscriptions.push(
        observable.subscribe({
          next: () => {
            valueCount++;

            if (valueCount >= 5) {
              throw new Error("boom");
            }
          },
          error: () => {
            errorCount++;
          },
        }),
      );

      results.push({
        get values() {
          return valueCount;
        },
        get errors() {
          return errorCount;
        },
      });
    }

    const values = Array.from({ length: 10 }, (_, i) => i);

    emitBurst(emit, values);

    for (const result of results) {
      expect(result.values).toBe(10);
      expect(result.errors).toBe(6);
    }

    for (const sub of subscriptions) {
      expect(sub.closed).toBe(false);

      sub.unsubscribe();
    }
  });

  it("8.4: pipe(map(throws), filter, map) × 100 values → error propagated, subscription NOT closed", () => {
    const { observable, emit } = createControllableSource<number>();
    let errorCount = 0;

    const piped = observable.pipe(
      map(() => {
        throw new Error("map-boom");
      }),
      filter(() => true),
      map((x: never) => x),
    );

    const sub = piped.subscribe({
      next: () => {},
      error: () => {
        errorCount++;
      },
    });

    const values = Array.from({ length: 100 }, (_, i) => i);

    emitBurst(emit, values);

    expect(errorCount).toBe(100);
    expect(sub.closed).toBe(false);

    sub.unsubscribe();
  });

  it("8.5: 100 subscriptions without error handler + emit error → console.error called", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { observable, emit } = createControllableSource<number>();
    const subscriptions: Subscription[] = [];

    for (let i = 0; i < 100; i++) {
      subscriptions.push(
        observable.subscribe({
          next: () => {
            throw new Error("boom");
          },
        }),
      );
    }

    emit(1);

    expect(consoleSpy).toHaveBeenCalledTimes(100);

    for (const sub of subscriptions) {
      sub.unsubscribe();
    }

    consoleSpy.mockRestore();
  });

  it("8.6: 500 emissions, next throws, error handler calls unsubscribe → error handler called once", () => {
    const { observable, emit } = createControllableSource<number>();
    let errorCount = 0;
    let sub: Subscription;

    sub = observable.subscribe({
      next: () => {
        throw new Error("boom");
      },
      error: () => {
        errorCount++;
        sub.unsubscribe();
      },
    });

    const values = Array.from({ length: 500 }, (_, i) => i);

    emitBurst(emit, values);

    expect(errorCount).toBe(1);
    expect(sub.closed).toBe(true);
  });
});
