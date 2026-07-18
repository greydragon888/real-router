// packages/validation-plugin/src/type-guards/guards/primitives.ts

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
