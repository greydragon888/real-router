// packages/core/src/namespaces/LimitsNamespace/helpers.ts

/**
 * Recursively freezes an object and all nested objects.
 * Only freezes plain objects, not primitives or special objects.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];

    /* v8 ignore next 3 -- @preserve LimitsConfig is flat, no nested objects */
    if (value && typeof value === "object" && value.constructor === Object) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * Computes warning and error thresholds for a given limit.
 * WARN threshold: 20% of limit
 * ERROR threshold: 50% of limit
 */
export function computeThresholds(limit: number): {
  warn: number;
  error: number;
} {
  return {
    warn: Math.floor(limit * 0.2),
    error: Math.floor(limit * 0.5),
  };
}
