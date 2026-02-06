import type {
  Observer,
  Subscription,
  ObservableOptions,
  SubscribeFn,
  Operator,
} from "./types";

declare global {
  interface SymbolConstructor {
    readonly observable: symbol;
  }
}

export class RxObservable<T> {
  #subscribeFn: SubscribeFn<T>;

  constructor(subscribeFn: SubscribeFn<T>) {
    this.#subscribeFn = subscribeFn;
  }

  subscribe(
    observerOrNext: Observer<T> | ((value: T) => void),
    options?: ObservableOptions,
  ): Subscription {
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? { next: observerOrNext }
        : observerOrNext;

    const { signal } = options ?? {};

    if (signal?.aborted) {
      return {
        unsubscribe: () => {},
        closed: true,
      };
    }

    let closed = false;
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- matches SubscribeFn return type
    let teardown: void | (() => void);

    const safeNext = (value: T) => {
      if (closed) {
        return;
      }

      try {
        observer.next?.(value);
      } catch (error) {
        safeError(error);
      }
    };

    const safeError = (err: unknown) => {
      if (closed) {
        return;
      }

      try {
        if (observer.error) {
          observer.error(err);
        } else {
          console.error("Unhandled error in RxObservable:", err);
        }
      } catch {
        // Errors in error handler are caught silently
      }
    };

    const safeComplete = () => {
      if (closed) {
        return;
      }

      closed = true;

      try {
        observer.complete?.();
      } catch {
        // Errors in complete handler are caught silently
      }
    };

    const subscription: Subscription = {
      unsubscribe: () => {
        if (closed) {
          return;
        }

        closed = true;

        if (abortHandler) {
          signal?.removeEventListener("abort", abortHandler);
        }

        if (teardown) {
          try {
            teardown();
          } catch {
            // Teardown errors are caught silently
          }
        }
      },
      get closed() {
        return closed;
      },
    };

    let abortHandler: (() => void) | undefined;

    if (signal) {
      abortHandler = () => {
        subscription.unsubscribe();
      };
      signal.addEventListener("abort", abortHandler);
    }

    try {
      teardown = this.#subscribeFn({
        next: safeNext,
        error: safeError,
        complete: safeComplete,
      });
    } catch (error) {
      safeError(error);
    }

    return subscription;
  }

  pipe(): this;
  pipe<A>(op1: Operator<T, A>): RxObservable<A>;
  pipe<A, B>(op1: Operator<T, A>, op2: Operator<A, B>): RxObservable<B>;
  pipe<A, B, C>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
  ): RxObservable<C>;
  pipe<A, B, C, D>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
  ): RxObservable<D>;
  pipe<A, B, C, D, E>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
  ): RxObservable<E>;
  pipe<A, B, C, D, E, F>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
    op6: Operator<E, F>,
  ): RxObservable<F>;
  pipe<A, B, C, D, E, F, G>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
    op6: Operator<E, F>,
    op7: Operator<F, G>,
  ): RxObservable<G>;
  pipe<A, B, C, D, E, F, G, H>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
    op6: Operator<E, F>,
    op7: Operator<F, G>,
    op8: Operator<G, H>,
  ): RxObservable<H>;
  pipe<A, B, C, D, E, F, G, H, I>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
    op6: Operator<E, F>,
    op7: Operator<F, G>,
    op8: Operator<G, H>,
    op9: Operator<H, I>,
  ): RxObservable<I>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe(...operators: Operator<any, any>[]): any {
    if (operators.length === 0) {
      return this;
    }

    // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias -- pipe pattern
    let result: RxObservable<unknown> = this;

    for (const operator of operators) {
      result = operator(result);
    }

    return result;
  }

  [Symbol.observable](): this {
    return this;
  }

  ["@@observable"](): this {
    return this;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let resolve: (() => void) | null = null;
    let latestValue: T | undefined;
    let hasValue = false;
    let completed = false;
    let error: unknown = null;

    const subscription = this.subscribe({
      next: (value) => {
        latestValue = value;
        hasValue = true;
        if (resolve) {
          const r = resolve;

          resolve = null;
          r();
        }
      },
      /* v8 ignore start -- v8 coverage can't track branches inside suspended async generators */
      error: (err) => {
        error = err;
        completed = true;
        if (resolve) {
          const r = resolve;

          resolve = null;
          r();
        }
      },
      complete: () => {
        completed = true;
        if (resolve) {
          const r = resolve;

          resolve = null;
          r();
        }
      },
      /* v8 ignore stop */
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- v8 ignore affects analysis
      while (!completed) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- v8 ignore affects analysis
        if (hasValue) {
          const value = latestValue as T;

          hasValue = false;
          yield value;
        } else {
          await new Promise<void>((_resolve) => {
            resolve = _resolve;
          });

          if (error !== null) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw error;
          }
        }
      }
    } finally {
      subscription.unsubscribe();
    }
  }
}
