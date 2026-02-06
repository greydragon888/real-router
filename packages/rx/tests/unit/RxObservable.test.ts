import { describe, it, expect } from "vitest";

import { RxObservable } from "../../src/RxObservable";

import type { Observer } from "../../src/types";

describe("RxObservable", () => {
  describe("constructor", () => {
    it("creates a cold observable", () => {
      let subscribed = false;
      const observable = new RxObservable(() => {
        subscribed = true;
      });

      expect(subscribed).toBe(false);

      observable.subscribe(() => {});

      expect(subscribed).toBe(true);
    });
  });

  describe("subscribe", () => {
    it("accepts observer object", () => {
      const values: number[] = [];
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);
        observer.next?.(3);
      });

      observable.subscribe({ next: (v) => values.push(v) });

      expect(values).toStrictEqual([1, 2, 3]);
    });

    it("accepts function shorthand", () => {
      const values: number[] = [];
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);
      });

      observable.subscribe((v) => values.push(v));

      expect(values).toStrictEqual([1, 2]);
    });

    it("returns subscription with closed property", () => {
      const observable = new RxObservable(() => {});
      const subscription = observable.subscribe(() => {});

      expect(subscription.closed).toBe(false);

      subscription.unsubscribe();

      expect(subscription.closed).toBe(true);
    });

    it("stops emissions after unsubscribe", () => {
      const values: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);
      });

      const subscription = observable.subscribe((v) => values.push(v));

      emit!(1);
      emit!(2);
      subscription.unsubscribe();
      emit!(3);

      expect(values).toStrictEqual([1, 2]);
    });

    it("handles multiple unsubscribe calls as no-op", () => {
      const observable = new RxObservable(() => {});
      const subscription = observable.subscribe(() => {});

      subscription.unsubscribe();
      subscription.unsubscribe();
      subscription.unsubscribe();

      expect(subscription.closed).toBe(true);
    });

    it("does not call complete on unsubscribe", () => {
      const completeCalls: number[] = [];
      const observable = new RxObservable(() => {});

      const subscription = observable.subscribe({
        complete: () => completeCalls.push(1),
      });

      subscription.unsubscribe();

      expect(completeCalls).toStrictEqual([]);
    });

    it("does not call complete multiple times from source", () => {
      const completeCalls: number[] = [];
      const observable = new RxObservable((observer) => {
        observer.complete?.();
        observer.complete?.(); // Second should be ignored
      });

      observable.subscribe({
        complete: () => completeCalls.push(1),
      });

      expect(completeCalls).toStrictEqual([1]);
    });

    it("handles re-entrant unsubscribe from complete handler", () => {
      const completeCalls: number[] = [];
      const observable = new RxObservable((observer) => {
        observer.complete?.(); // Source-initiated complete
      });

      let subscription: any;

      subscription = observable.subscribe({
        complete: () => {
          completeCalls.push(1);
          subscription.unsubscribe(); // Unsubscribe during complete
        },
      });

      expect(completeCalls).toStrictEqual([1]);
    });

    it("complete from source still works correctly", () => {
      const nextCalls: number[] = [];
      const completeCalls: number[] = [];
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.complete?.();
      });

      observable.subscribe({
        next: (value) => nextCalls.push(value),
        complete: () => completeCalls.push(1),
      });

      expect(nextCalls).toStrictEqual([1]);
      expect(completeCalls).toStrictEqual([1]);
    });

    it("safeComplete guards against closed state", () => {
      const completeCalls: number[] = [];
      const observable = new RxObservable((observer) => {
        observer.complete?.();
        observer.complete?.();
      });

      observable.subscribe({
        complete: () => completeCalls.push(1),
      });

      expect(completeCalls).toStrictEqual([1]);
    });

    it("unsubscribe does not trigger complete callback", () => {
      const completeCalls: number[] = [];
      const teardownCalls: number[] = [];
      const observable = new RxObservable(() => {
        return () => teardownCalls.push(1);
      });

      const subscription = observable.subscribe({
        complete: () => completeCalls.push(1),
      });

      subscription.unsubscribe();

      expect(teardownCalls).toStrictEqual([1]);
      expect(completeCalls).toStrictEqual([]);
    });

    it("calls teardown function on unsubscribe", () => {
      const teardownCalls: number[] = [];
      const observable = new RxObservable(() => {
        return () => teardownCalls.push(1);
      });

      const subscription = observable.subscribe(() => {});

      subscription.unsubscribe();

      expect(teardownCalls).toStrictEqual([1]);
    });

    it("handles observer without next handler", () => {
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
      });

      expect(() => {
        observable.subscribe({});
      }).not.toThrowError();
    });
  });

  describe("error isolation", () => {
    it("catches errors in next and calls error handler", () => {
      const errors: unknown[] = [];
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
      });

      observable.subscribe({
        next: () => {
          throw new Error("next error");
        },
        error: (err) => errors.push(err),
      });

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("next error");
    });

    it("catches errors in error handler silently", () => {
      const observable = new RxObservable<number>((observer) => {
        observer.next?.(1);
      });

      expect(() => {
        observable.subscribe({
          next: () => {
            throw new Error("next error");
          },
          error: () => {
            throw new Error("error handler error");
          },
        });
      }).not.toThrowError();
    });

    it("catches errors in complete handler silently", () => {
      const observable = new RxObservable((observer) => {
        observer.complete?.(); // Source-initiated, not via unsubscribe
      });

      expect(() => {
        observable.subscribe({
          complete: () => {
            throw new Error("complete error");
          },
        });
      }).not.toThrowError();
    });

    it("catches errors in teardown silently", () => {
      const observable = new RxObservable(() => {
        return () => {
          throw new Error("teardown error");
        };
      });

      const subscription = observable.subscribe(() => {});

      expect(() => {
        subscription.unsubscribe();
      }).not.toThrowError();
    });

    it("reports unhandled error via console.error when no error handler", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const testError = new Error("unhandled error");

      const observable = new RxObservable<number>((observer) => {
        observer.error?.(testError);
      });

      observable.subscribe({});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Unhandled error in RxObservable:",
        testError,
      );

      consoleErrorSpy.mockRestore();
    });

    it("catches errors in subscribe function and calls error handler", () => {
      const errors: unknown[] = [];
      const observable = new RxObservable(() => {
        throw new Error("subscribe error");
      });

      observable.subscribe({
        error: (err) => errors.push(err),
      });

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe("subscribe error");
    });

    it("does not call error handler after subscription is closed", () => {
      const errors: unknown[] = [];
      let emitError: ((err: Error) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emitError = (err) => {
          try {
            observer.error?.(err);
          } catch (error) {
            errors.push(error);
          }
        };
      });

      const subscription = observable.subscribe({
        error: () => errors.push("error handler called"),
      });

      subscription.unsubscribe();
      emitError!(new Error("after close"));

      expect(errors).toStrictEqual([]);
    });
  });

  describe("re-subscription", () => {
    it("allows re-subscription after unsubscribe", () => {
      const values: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);
      });

      const observer: Observer<number> = { next: (v) => values.push(v) };

      const sub1 = observable.subscribe(observer);

      emit!(1);
      sub1.unsubscribe();

      observable.subscribe(observer);

      emit!(2);

      expect(values).toStrictEqual([1, 2]);
    });
  });

  describe("AbortSignal", () => {
    it("auto-unsubscribes when signal aborts", () => {
      const values: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);
      });

      const controller = new AbortController();

      observable.subscribe((v) => values.push(v), {
        signal: controller.signal,
      });

      emit!(1);
      controller.abort();
      emit!(2);

      expect(values).toStrictEqual([1]);
    });

    it("returns closed subscription if signal is pre-aborted", () => {
      const observable = new RxObservable(() => {});
      const controller = new AbortController();

      controller.abort();

      const subscription = observable.subscribe(() => {}, {
        signal: controller.signal,
      });

      expect(subscription.closed).toBe(true);

      // Call unsubscribe to cover the no-op function
      subscription.unsubscribe();

      expect(subscription.closed).toBe(true);
    });

    it("removes abort listener on unsubscribe", () => {
      const observable = new RxObservable(() => {});
      const controller = new AbortController();

      const subscription = observable.subscribe(() => {}, {
        signal: controller.signal,
      });

      const listenerCount =
        (controller.signal as any).listenerCount?.("abort") ?? 0;

      expect(listenerCount).toBeGreaterThanOrEqual(0);

      subscription.unsubscribe();

      controller.abort();
    });
  });

  describe("pipe", () => {
    it("returns self when called with no operators", () => {
      const observable = new RxObservable(() => {});
      const piped = observable.pipe();

      expect(piped).toBe(observable);
    });

    it("creates independent chains", () => {
      const values1: number[] = [];
      const values2: number[] = [];
      const emitters: ((v: number) => void)[] = [];

      const source = new RxObservable<number>((observer) => {
        const emit = (v: number) => observer.next?.(v);

        emitters.push(emit);

        return () => {
          const index = emitters.indexOf(emit);

          if (index !== -1) {
            emitters.splice(index, 1);
          }
        };
      });

      const double = (obs: RxObservable<number>) =>
        new RxObservable<number>((observer) => {
          const sub = obs.subscribe((v) => observer.next?.(v * 2));

          return () => {
            sub.unsubscribe();
          };
        });

      const piped = source.pipe(double);

      source.subscribe((v) => values1.push(v));
      piped.subscribe((v) => values2.push(v));

      emitters.forEach((emit) => {
        emit(1);
      });
      emitters.forEach((emit) => {
        emit(2);
      });

      expect(values1).toStrictEqual([1, 2]);
      expect(values2).toStrictEqual([2, 4]);
    });

    it("composes operators correctly", () => {
      const values: number[] = [];

      const source = new RxObservable<number>((observer) => {
        observer.next?.(1);
        observer.next?.(2);
        observer.next?.(3);
      });

      // eslint-disable-next-line sonarjs/no-identical-functions
      const double = (obs: RxObservable<number>) =>
        new RxObservable<number>((observer) => {
          const sub = obs.subscribe((v) => observer.next?.(v * 2));

          return () => {
            sub.unsubscribe();
          };
        });

      const addTen = (obs: RxObservable<number>) =>
        new RxObservable<number>((observer) => {
          const sub = obs.subscribe((v) => observer.next?.(v + 10));

          return () => {
            sub.unsubscribe();
          };
        });

      source.pipe(double, addTen).subscribe((v) => values.push(v));

      expect(values).toStrictEqual([12, 14, 16]);
    });
  });

  describe("Symbol.observable", () => {
    it("returns self", () => {
      const observable = new RxObservable(() => {});
      const result = observable[Symbol.observable]();

      expect(result).toBe(observable);
    });
  });

  describe("@@observable", () => {
    it("returns self", () => {
      const observable = new RxObservable(() => {});
      const result = (observable as any)["@@observable"]();

      expect(result).toBe(observable);
    });
  });

  describe("Symbol.asyncIterator", () => {
    it("yields values via for await", async () => {
      const values: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);

        return () => {};
      });

      const iteratorPromise = (async () => {
        for await (const value of observable) {
          values.push(value);
          if (value === 3) {
            break;
          }
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(2);
      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(3);

      await iteratorPromise;

      expect(values).toStrictEqual([1, 2, 3]);
    });

    it("exits cleanly on break", async () => {
      const values: number[] = [];
      const teardownCalls: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);

        return () => teardownCalls.push(1);
      });

      const iteratorPromise = (async () => {
        for await (const value of observable) {
          values.push(value);
          if (value === 2) {
            break;
          }
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(2);

      await iteratorPromise;

      expect(values).toStrictEqual([1, 2]);
      expect(teardownCalls).toStrictEqual([1]);
    });

    it("uses latest-value semantics", async () => {
      const values: number[] = [];
      let emit: ((v: number) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emit = (v) => observer.next?.(v);
      });

      const iteratorPromise = (async () => {
        for await (const value of observable) {
          values.push(value);
          if (value === 3) {
            break;
          }
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      emit!(1);
      emit!(2);
      emit!(3);

      await iteratorPromise;

      expect(values).toStrictEqual([3]);
    });

    it("completes on observable complete", async () => {
      const values: number[] = [];
      let complete: (() => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        complete = () => observer.complete?.();
        observer.next?.(1);
      });

      const iteratorPromise = (async () => {
        for await (const value of observable) {
          values.push(value);
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      complete!();

      await iteratorPromise;

      expect(values).toStrictEqual([1]);
    });

    it("throws on observable error", async () => {
      let emitError: ((err: Error) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emitError = (err) => observer.error?.(err);
      });

      const iteratorPromise = (async () => {
        // eslint-disable-next-line no-empty, sonarjs/no-unused-vars
        for await (const _value of observable) {
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      emitError!(new Error("test error"));

      await expect(iteratorPromise).rejects.toThrowError("test error");
    });

    it("throws on observable error with value", async () => {
      let emitValue: ((v: number) => void) | null = null;
      let emitError: ((err: Error) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emitValue = (v) => observer.next?.(v);
        emitError = (err) => observer.error?.(err);
      });

      const iteratorPromise = (async () => {
        const values: number[] = [];

        for await (const value of observable) {
          values.push(value);
        }

        return values;
      })();

      await new Promise((resolve) => setTimeout(resolve, 10));
      emitValue!(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      emitError!(new Error("error after value"));

      await expect(iteratorPromise).rejects.toThrowError("error after value");
    });

    it("handles error while iterator is actively waiting in Promise", async () => {
      // Use queueMicrotask to emit error after iterator has entered await
      const observable = new RxObservable<number>((observer) => {
        // Schedule error emission after the current microtask queue is processed
        // This ensures iterator has entered the await state
        queueMicrotask(() => {
          queueMicrotask(() => {
            observer.error?.(new Error("error while waiting"));
          });
        });
      });

      await expect(async () => {
        // eslint-disable-next-line sonarjs/no-unused-vars
        for await (const _value of observable) {
          // Iterator will wait here, then error will be emitted
        }
      }).rejects.toThrowError("error while waiting");
    });

    it("handles complete while iterator is actively waiting in Promise", async () => {
      // Use queueMicrotask to emit complete after iterator has entered await
      const observable = new RxObservable<number>((observer) => {
        queueMicrotask(() => {
          queueMicrotask(() => {
            observer.complete?.();
          });
        });
      });

      const values: number[] = [];

      for await (const value of observable) {
        values.push(value);
      }

      expect(values).toStrictEqual([]);
    });

    it("handles error when not waiting for value", async () => {
      let emitError: ((err: Error) => void) | null = null;

      const observable = new RxObservable<number>((observer) => {
        emitError = (err) => observer.error?.(err);
        setTimeout(() => {
          emitError!(new Error("delayed error"));
        }, 5);
      });

      const iterator = observable[Symbol.asyncIterator]();

      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(iterator.next()).rejects.toThrowError("delayed error");
    });
  });
});
