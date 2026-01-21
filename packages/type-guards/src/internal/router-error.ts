// packages/type-guards/modules/internal/router-error.ts

/**
 * Checks if string contains at least one non-whitespace character.
 * Used to validate that route name is not empty or only whitespace.
 * Matches: any non-whitespace character (\S = [^ \t\n\r\f])
 *
 * @internal
 */
export const HAS_NON_WHITESPACE = /\S/;

/**
 * Pattern for complete route validation (all segments at once).
 * Matches: single segment or multiple segments separated by dots.
 * Each segment must start with letter/underscore, followed by alphanumeric/hyphen/underscore.
 * Rejects: leading/trailing/consecutive dots, segments starting with numbers/hyphens.
 * Note: Empty string is handled by early return in validateRouteName.
 *
 * @internal
 */
export const FULL_ROUTE_PATTERN = /^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/;

/**
 * Maximum route name length to prevent DoS and performance issues.
 * This is a technical limit, not a business constraint.
 * Real route names rarely exceed 200 characters even with deep nesting.
 *
 * @internal
 */
export const MAX_ROUTE_NAME_LENGTH = 10_000;

/**
 * Creates a TypeError with consistent router error message format.
 *
 * @param methodName - Name of the method that triggered the error
 * @param message - Error message
 * @returns TypeError with formatted message
 * @internal
 */
export function createRouterError(
  methodName: string,
  message: string,
): TypeError {
  return new TypeError(`[router.${methodName}] ${message}`);
}
