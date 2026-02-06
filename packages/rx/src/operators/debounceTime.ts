import { RxObservable } from "../RxObservable";

import type { Operator } from "../types";

export function debounceTime<T>(duration: number): Operator<T, T> {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError(
      `debounceTime: duration must be a non-negative finite number, got ${duration}`,
    );
  }

  return (source: RxObservable<T>) =>
    new RxObservable<T>((observer) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let latestValue: T;
      let hasValue = false;

      const subscription = source.subscribe({
        next: (value) => {
          latestValue = value;
          hasValue = true;

          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }

          timeoutId = setTimeout(() => {
            /* v8 ignore start -- defensive: timer fired after flush */
            if (hasValue) {
              observer.next?.(latestValue);
              hasValue = false;
            }
            /* v8 ignore stop */

            timeoutId = undefined;
          }, duration);
        },
        error: (error) => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }

          observer.error?.(error);
        },
        complete: () => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }

          if (hasValue) {
            observer.next?.(latestValue);
            hasValue = false;
          }

          observer.complete?.();
        },
      });

      return () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        subscription.unsubscribe();
      };
    });
}
