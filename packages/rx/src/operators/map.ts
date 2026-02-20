import { createOperator } from "./createOperator";

import type { Operator } from "../types";

export function map<T, R>(project: (value: T) => R): Operator<T, R> {
  return createOperator<T, R>((value, observer) => {
    try {
      const result = project(value);

      observer.next?.(result);
    } catch (error) {
      observer.error?.(error);
    }
  });
}
