// packages/type-guards/modules/primitives.ts

/**
 * Type guard for string type.
 *
 * @param value - Value to check
 * @returns true if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Type guard for boolean type.
 *
 * @param value - Value to check
 * @returns true if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Type guard for Promise type.
 *
 * @param value - Value to check
 * @returns true if value is a Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

/**
 * Type guard for object key existence.
 * Narrows the key type to a valid key of the object.
 *
 * @param key - Key to check
 * @param obj - Object to check in
 * @returns true if key exists in object
 */
export function isObjKey<T extends object>(
  key: string,
  obj: T,
): key is Extract<keyof T, string> {
  return key in obj;
}

/**
 * Type guard for primitive values suitable for URL parameters.
 * Only string, number, and boolean are allowed.
 * Rejects NaN and Infinity for numbers.
 *
 * @param value - Value to check
 * @returns true if value is string, number, or boolean
 */
export function isPrimitiveValue(
  value: unknown,
): value is string | number | boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "string" || typeof value === "boolean";
}
