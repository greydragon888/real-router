// packages/type-guards/modules/internal/type-description.ts

/**
 * Gets a human-readable description of a value's type.
 * Used for error messages to provide helpful debugging information.
 *
 * @param value - Value to describe
 * @returns String description of the value's type
 *
 * @example
 * getTypeDescription(null);           // "null"
 * getTypeDescription([1, 2, 3]);      // "array[3]"
 * getTypeDescription(new Date());     // "Date"
 * getTypeDescription({});             // "object"
 * getTypeDescription("hello");        // "string"
 */
export function getTypeDescription(value: unknown): string {
  // Handle null explicitly (typeof null === "object")
  if (value === null) {
    return "null";
  }

  // Array with length info
  if (Array.isArray(value)) {
    return `array[${value.length}]`;
  }

  if (typeof value === "object") {
    // Return constructor name for class instances
    if ("constructor" in value && value.constructor.name !== "Object") {
      return value.constructor.name;
    }

    // Plain object
    return "object";
  }

  // Primitive types (string, number, boolean, undefined, etc.)
  // Note: typeof undefined === "undefined", so we don't need explicit check
  return typeof value;
}
