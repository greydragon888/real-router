import { describe, it, expect } from "vitest";

import { RxObservable, map, filter, distinctUntilChanged } from "../../../src";

describe("Operator error handling", () => {
  describe("map error handling", () => {
    it("should propagate error from project function", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);

        return;
      });

      source
        .pipe(
          map((value) => {
            if (value === 2) {
              throw new Error("map error");
            }

            return value * 2;
          }),
        )
        .subscribe({
          error: (error) => errors.push(error),
        });

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("map error");
    });

    it("should propagate error from source in map", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        setTimeout(() => observer.error?.(new Error("source error")), 10);

        return;
      });

      source.pipe(map((value) => value * 2)).subscribe({
        error: (error) => errors.push(error),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("source error");
    });

    it("should propagate complete from source in map", () => {
      const values: number[] = [];
      const completeCalls: number[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);
        observer.complete?.();

        return;
      });

      source.pipe(map((value) => value * 2)).subscribe({
        next: (value) => values.push(value),
        complete: () => completeCalls.push(1),
      });

      expect(values).toStrictEqual([2, 4]);
      expect(completeCalls).toStrictEqual([1]);
    });
  });

  describe("filter error handling", () => {
    it("should propagate error from predicate function", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);

        return;
      });

      source
        .pipe(
          filter((value) => {
            if (value === 2) {
              throw new Error("filter error");
            }

            return true;
          }),
        )
        .subscribe({
          error: (error) => errors.push(error),
        });

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("filter error");
    });

    it("should propagate error from source in filter", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        setTimeout(() => observer.error?.(new Error("source error")), 10);

        return;
      });

      source.pipe(filter((value) => value > 0)).subscribe({
        error: (error) => errors.push(error),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("source error");
    });

    it("should propagate complete from source in filter", () => {
      const values: number[] = [];
      const completeCalls: number[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);
        observer.next?.(3);
        observer.complete?.();

        return;
      });

      source.pipe(filter((value) => value % 2 === 1)).subscribe({
        next: (value) => values.push(value),
        complete: () => completeCalls.push(1),
      });

      expect(values).toStrictEqual([1, 3]);
      expect(completeCalls).toStrictEqual([1]);
    });
  });

  describe("null and undefined through operators", () => {
    it("should pass null through map without crash", () => {
      const values: (string | null)[] = [];

      const source = new RxObservable<string | null>((observer) => {
        observer.next?.(null);
        observer.next?.("hello");
        observer.next?.(null);
        observer.complete?.();

        return;
      });

      source
        .pipe(map((value) => (value === null ? null : value.toUpperCase())))
        .subscribe({
          next: (value) => values.push(value),
        });

      expect(values).toStrictEqual([null, "HELLO", null]);
    });

    it("should pass undefined through map without crash", () => {
      const values: (number | undefined)[] = [];

      const source = new RxObservable<number | undefined>((observer) => {
        observer.next?.(undefined);
        observer.next?.(42);
        observer.next?.(undefined);
        observer.complete?.();

        return;
      });

      source.pipe(map((value) => value)).subscribe({
        next: (value) => values.push(value),
      });

      expect(values).toStrictEqual([undefined, 42, undefined]);
    });

    it("should pass null through filter without crash", () => {
      const values: (string | null)[] = [];

      const source = new RxObservable<string | null>((observer) => {
        observer.next?.(null);
        observer.next?.("hello");
        observer.next?.(null);
        observer.complete?.();

        return;
      });

      source
        .pipe(filter((value): value is string | null => value !== "hello"))
        .subscribe({
          next: (value) => values.push(value),
        });

      expect(values).toStrictEqual([null, null]);
    });

    it("should pass undefined through filter without crash", () => {
      const values: (number | undefined)[] = [];

      const source = new RxObservable<number | undefined>((observer) => {
        observer.next?.(undefined);
        observer.next?.(42);
        observer.next?.(undefined);
        observer.complete?.();

        return;
      });

      source.pipe(filter((): boolean => true)).subscribe({
        next: (value) => values.push(value),
      });

      expect(values).toStrictEqual([undefined, 42, undefined]);
    });

    it("should handle null/undefined through distinctUntilChanged", () => {
      const values: (string | null | undefined)[] = [];

      const source = new RxObservable<string | null | undefined>((observer) => {
        observer.next?.(null);
        observer.next?.(null);
        observer.next?.(undefined);
        observer.next?.(undefined);
        observer.next?.("value");
        observer.next?.(null);
        observer.complete?.();

        return;
      });

      source.pipe(distinctUntilChanged()).subscribe({
        next: (value) => values.push(value),
      });

      expect(values).toStrictEqual([null, undefined, "value", null]);
    });
  });

  describe("distinctUntilChanged error handling", () => {
    it("should propagate error from comparator function", async () => {
      const errors: unknown[] = [];
      const values: number[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(1);
        observer.next?.(2);

        return;
      });

      source
        .pipe(
          distinctUntilChanged((prev, curr) => {
            if (curr === 2) {
              throw new Error("comparator error");
            }

            return prev === curr;
          }),
        )
        .subscribe({
          next: (value) => values.push(value),
          error: (error) => errors.push(error),
        });

      expect(values).toStrictEqual([1]);
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("comparator error");
    });

    it("should propagate error from source in distinctUntilChanged", async () => {
      const errors: unknown[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        setTimeout(() => observer.error?.(new Error("source error")), 10);

        return;
      });

      source.pipe(distinctUntilChanged()).subscribe({
        error: (error) => errors.push(error),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("source error");
    });
  });
});
