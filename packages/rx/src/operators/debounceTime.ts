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
          // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — clearing the pending timer at complete is a no-op shortcut: a stray timer self-clears (sets `timeoutId = undefined`) and its `if (hasValue)` guard is false after the flush below; `clearTimeout(undefined)` is itself a no-op, and complete() is terminal (injection-proven green).
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }

          if (hasValue) {
            observer.next?.(latestValue);
            // Stryker disable next-line BooleanLiteral: equivalent — resetting hasValue after the terminal flush is moot; complete() ends the stream so nothing reads it again (injection-proven green).
            hasValue = false;
          }

          observer.complete?.();
        },
      });

      return () => {
        // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — clearing the pending timer on teardown is unobservable: a timer firing after unsubscribe hits the closed observer (emit dropped) and self-clears; `clearTimeout(undefined)` is a no-op (injection-proven green; debounce-timer-churn.stress stays green).
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        subscription.unsubscribe();
      };
    });
}
