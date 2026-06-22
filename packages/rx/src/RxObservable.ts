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
  readonly #subscribeFn: SubscribeFn<T>;

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

    // Release the subscription's resources (abort listener + teardown). Runs on
    // every terminal path — unsubscribe AND complete — so a self-completing
    // source still releases its resource. `teardown` is undefined until
    // subscribeFn returns, so a synchronous complete() fires finalize() before
    // teardown exists; the post-subscribe `if (closed) finalize()` re-runs it
    // once teardown is assigned. teardown therefore executes at most once, and
    // removeEventListener is idempotent, so the double call is harmless.
    const finalize = () => {
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
    };

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

      finalize();
    };

    const subscription: Subscription = {
      unsubscribe: () => {
        if (closed) {
          return;
        }

        closed = true;

        finalize();
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

    // A synchronous complete() inside subscribeFn ran finalize() before
    // `teardown` was assigned above — run it now that the teardown exists. Read
    // via the getter: TS control-flow analysis can't see the closure mutation of
    // `closed`, so a bare `if (closed)` is flagged as always-false.
    if (subscription.closed) {
      finalize();
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
  pipe<A, B, C, D, E, F, G, H>( // NOSONAR -- typed pipe overload (RxJS shape, 1-9 operators); param count is the public API, not refactorable
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>,
    op6: Operator<E, F>,
    op7: Operator<F, G>,
    op8: Operator<G, H>,
  ): RxObservable<H>;
  pipe<A, B, C, D, E, F, G, H, I>( // NOSONAR -- typed pipe overload (RxJS shape, 1-9 operators); param count is the public API, not refactorable
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

  // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties -- intentional TC39 Observable interop protocol (paired with ["@@observable"] below)
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
          const resolveCallback = resolve;

          resolve = null;
          resolveCallback();
        }
      },
      error: (err) => {
        error = err;
        completed = true;
        if (resolve) {
          const resolveCallback = resolve;

          resolve = null;
          resolveCallback();
        }
      },
      complete: () => {
        completed = true;
        if (resolve) {
          const resolveCallback = resolve;

          resolve = null;
          resolveCallback();
        }
      },
    });

    try {
      for (;;) {
        // Drain a buffered value before honoring a terminal: a value emitted
        // immediately before a synchronous complete()/error() must still be
        // yielded (the terminal batch), and a fresh value can arrive while the
        // generator is suspended at the await below.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- flags are mutated by subscription closures, invisible to CFA
        if (hasValue) {
          const value = latestValue as T;

          hasValue = false;
          yield value;

          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- flags are mutated by subscription closures, invisible to CFA
        if (completed) {
          if (error !== null) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw error;
          }

          break;
        }

        // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- Promise.withResolvers<void>() trips @typescript-eslint/no-invalid-void-type; the resolver is captured into the outer `resolve` by design
        await new Promise<void>((_resolve) => {
          resolve = _resolve;
        });
      }
    } finally {
      subscription.unsubscribe();
    }
  }
}
