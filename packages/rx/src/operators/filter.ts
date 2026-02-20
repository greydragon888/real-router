import { createOperator } from "./createOperator";

import type { Operator } from "../types";

export function filter<T, S extends T>(
  predicate: (value: T) => value is S,
): Operator<T, S>;

export function filter<T>(predicate: (value: T) => boolean): Operator<T, T>;

export function filter<T>(predicate: (value: T) => boolean): Operator<T, T> {
  return createOperator<T, T>((value, observer) => {
    try {
      if (predicate(value)) {
        observer.next?.(value);
      }
    } catch (error) {
      observer.error?.(error);
    }
  });
}
