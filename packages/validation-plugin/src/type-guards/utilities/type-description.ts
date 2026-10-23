// packages/validation-plugin/src/type-guards/utilities/type-description.ts

/**
 * Gets a human-readable description of a value's type.
 * Used for error messages to provide helpful debugging information.
 *
 * It answers a string for every value and never throws: the description lands
 * in a message, and the message must not become the thing that fails.
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

  // Primitive types and functions: `typeof` reads nothing off the value.
  if (typeof value !== "object") {
    return typeof value;
  }

  // Describing an object reads it, and every read can run application code:
  // `Array.isArray` throws on a revoked proxy, `length` and `constructor` are
  // accessors or traps, and an adversarial own `constructor` (null, a string, a
  // number, …) is not a real constructor (#787). A read that throws (#1052), or
  // a `name` that is not a string, falls back to "object".
  try {
    // Array with length info
    if (Array.isArray(value)) {
      return `array[${value.length}]`;
    }

    const ctor: unknown = (value as { constructor?: unknown }).constructor;

    if (typeof ctor === "function") {
      const name: unknown = ctor.name;

      // Return constructor name for class instances; an anonymous class has
      // an empty one.
      if (typeof name === "string" && name !== "" && name !== "Object") {
        return name;
      }
    }
  } catch {
    // A throwing read describes nothing; "object" stands.
  }

  // Plain object, null-prototype object, or adversarial / throwing constructor
  return "object";
}
