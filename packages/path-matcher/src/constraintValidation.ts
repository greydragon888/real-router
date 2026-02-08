// packages/path-matcher/src/constraintValidation.ts

/**
 * Constraint Validation.
 *
 * Validates parameter values against constraint patterns.
 *
 * @module constraintValidation
 */

import type { ConstraintPattern } from "./types";

/**
 * Validates parameters against constraint patterns.
 *
 * Throws an error if any parameter value doesn't match its constraint pattern.
 * Error message format is exact-matched by tests.
 *
 * @param params - Parameter values to validate
 * @param constraintPatterns - Map of parameter names to constraint patterns
 * @param path - Route path pattern (used in error message)
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * const patterns = new Map([
 *   ["id", { pattern: /^(\d+)$/, constraint: "<\\d+>" }]
 * ]);
 *
 * validateConstraints({ id: "123" }, patterns, "/users/:id<\\d+>");
 * // ✓ No error
 *
 * validateConstraints({ id: "abc" }, patterns, "/users/:id<\\d+>");
 * // ✗ Error: Parameter 'id' of '/users/:id<\\d+>' has invalid format: got 'abc', expected to match '\\d+'
 * ```
 */
export function validateConstraints(
  params: Record<string, unknown>,
  constraintPatterns: ReadonlyMap<string, ConstraintPattern>,
  path: string,
): void {
  for (const [paramName, { pattern, constraint }] of constraintPatterns) {
    const value = String(params[paramName]);

    if (!pattern.test(value)) {
      const constraintPattern = constraint
        ? constraint.replaceAll(/(^<)|(>$)/g, "")
        : "[^/]+";

      throw new Error(
        `Parameter '${paramName}' of '${path}' has invalid format: ` +
          `got '${value}', expected to match '${constraintPattern}'`,
      );
    }
  }
}
