// packages/persistent-params-plugin/src/is-primitive-value.ts

/**
 * Type guard for primitive values suitable for URL parameters.
 * Only string, number, and boolean are allowed.
 * Rejects NaN and Infinity for numbers.
 *
 * Lives next to `validation.ts` because `persistent-params` is its only
 * consumer (M1).
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
