// packages/persistent-params-plugin/src/is-primitive-value.ts

/**
 * Type guard for primitive values suitable for URL parameters.
 * Only string, number, and boolean are allowed.
 * Rejects NaN and Infinity for numbers.
 *
 * Dissolved from the former private `type-guards` package (M1): persistent-params
 * was its only consumer, so the guard now lives next to `validation.ts`.
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
