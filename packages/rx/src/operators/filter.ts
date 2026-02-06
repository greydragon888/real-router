import { RxObservable } from "../RxObservable";

import type { Operator } from "../types";

export function filter<T, S extends T>(
  predicate: (value: T) => value is S,
): Operator<T, S>;

export function filter<T>(predicate: (value: T) => boolean): Operator<T, T>;

export function filter<T>(predicate: (value: T) => boolean): Operator<T, T> {
  return (source: RxObservable<T>) =>
    new RxObservable<T>((observer) => {
      const subscription = source.subscribe({
        next: (value) => {
          try {
            if (predicate(value)) {
              observer.next?.(value);
            }
          } catch (error) {
            observer.error?.(error);
          }
        },
        error: (error) => observer.error?.(error),
        complete: () => observer.complete?.(),
      });

      return () => {
        subscription.unsubscribe();
      };
    });
}
