import { RxObservable } from "../RxObservable";

import type { Operator } from "../types";

export function map<T, R>(project: (value: T) => R): Operator<T, R> {
  return (source: RxObservable<T>) =>
    new RxObservable<R>((observer) => {
      const subscription = source.subscribe({
        next: (value) => {
          try {
            const result = project(value);

            observer.next?.(result);
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
