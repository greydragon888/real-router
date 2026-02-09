// packages/core/src/namespaces/OptionsNamespace/helpers.ts

import type { Options } from "@real-router/types";

/**
 * Creates a ReferenceError for option not found.
 */
export const optionNotFoundError = (
  method: string,
  name: keyof Options,
): ReferenceError =>
  new ReferenceError(`[router.${method}]: option "${name}" not found`);

/**
 * Recursively freezes an object and all nested objects.
 * Only freezes plain objects, not primitives or special objects.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];

    if (value && typeof value === "object" && value.constructor === Object) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * Resolves an option value that can be static or a callback.
 * If the value is a function, calls it with getDependency and returns the result.
 * Otherwise, returns the value as-is.
 */
export function resolveOption(
  value: unknown,
  getDependency: (name: string) => unknown,
): unknown {
  if (typeof value === "function") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return value(getDependency);
  }

  return value;
}
