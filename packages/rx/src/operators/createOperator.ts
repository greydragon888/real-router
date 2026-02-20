import { RxObservable } from "../RxObservable";

import type { Observer } from "../types";

/**
 * Creates a stateless operator. Wires error/complete/teardown automatically.
 * The `next` callback receives each value and the downstream observer.
 */
export function createOperator<T, R>(
  next: (value: T, observer: Observer<R>) => void,
): (source: RxObservable<T>) => RxObservable<R> {
  return (source: RxObservable<T>) =>
    new RxObservable<R>((observer) => {
      const subscription = source.subscribe({
        next: (value) => {
          next(value, observer);
        },
        error: (error) => observer.error?.(error),
        complete: () => observer.complete?.(),
      });

      return () => {
        subscription.unsubscribe();
      };
    });
}

/**
 * Creates a stateful operator. The subscribeFn sets up its own subscriptions
 * and returns a teardown function.
 */
export function createStatefulOperator<T, R>(
  subscribeFn: (source: RxObservable<T>, observer: Observer<R>) => () => void,
): (source: RxObservable<T>) => RxObservable<R> {
  return (source: RxObservable<T>) =>
    new RxObservable<R>((observer) => subscribeFn(source, observer));
}
