import { createStatefulOperator } from "./createOperator";

import type { Operator } from "../types";

export function distinctUntilChanged<T>(
  comparator?: (a: T, b: T) => boolean,
): Operator<T, T> {
  return createStatefulOperator<T, T>((source, observer) => {
    let hasLast = false;
    let last: T;
    const compare = comparator ?? ((a: T, b: T) => a === b);

    const subscription = source.subscribe({
      next: (value) => {
        if (!hasLast) {
          hasLast = true;
          last = value;
          observer.next?.(value);

          return;
        }

        try {
          if (!compare(last, value)) {
            last = value;
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
