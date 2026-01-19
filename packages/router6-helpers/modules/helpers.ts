// packages/router6-helpers/modules/index.ts

import {
  MAX_SEGMENT_LENGTH,
  ROUTE_SEGMENT_SEPARATOR,
  SAFE_SEGMENT_PATTERN,
} from "./constants";

import type { SegmentTestFunction } from "./types";
import type { State } from "router6";

/**
 * Escapes special RegExp characters in a string.
 * Handles all RegExp metacharacters including dash in character classes.
 *
 * @param str - String to escape
 * @returns Escaped string safe for RegExp construction
 * @internal
 */
const escapeRegExp = (str: string): string =>
  str.replaceAll(/[$()*+.?[\\\]^{|}-]/g, String.raw`\$&`);

/**
 * Creates a segment tester function with specified start and end patterns.
 * This is a factory function that produces the actual test functions.
 *
 * @param start - RegExp pattern for start (e.g., "^" for startsWith)
 * @param end - RegExp pattern for end (e.g., "$" or dotOrEnd for specific matching)
 * @returns A test function that can check if routes match the segment pattern
 * @internal
 */
const makeSegmentTester = (start: string, end: string) => {
  /**
   * Builds a RegExp for testing segment matches.
   * Validates length and character pattern. Type and empty checks are done by caller.
   *
   * This optimizes performance by avoiding redundant checks - callers verify
   * type and empty before calling this function.
   *
   * @param segment - The segment to build a regex for (non-empty string, pre-validated)
   * @returns RegExp for testing
   * @throws {RangeError} If segment exceeds maximum length
   * @throws {TypeError} If segment contains invalid characters
   * @internal
   */
  const buildRegex = (segment: string): RegExp => {
    // Type and empty checks are SKIPPED - caller already verified these

    // Length check
    if (segment.length > MAX_SEGMENT_LENGTH) {
      throw new RangeError(
        `Segment exceeds maximum length of ${MAX_SEGMENT_LENGTH} characters`,
      );
    }

    // Character pattern check
    if (!SAFE_SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(
        `Segment contains invalid characters. Allowed: a-z, A-Z, 0-9, dot (.), dash (-), underscore (_)`,
      );
    }

    return new RegExp(start + escapeRegExp(segment) + end);
  };

  // TypeScript cannot infer conditional return type for curried function with union return.
  // The function returns either boolean or a tester function based on whether segment is provided.
  // This is an intentional design pattern for API flexibility.
  // eslint-disable-next-line sonarjs/function-return-type
  return (route: State | string, segment?: string | null) => {
    // Extract route name, handling both string and State object inputs
    // State.name is always string by router6 type definition
    const name = typeof route === "string" ? route : route.name;

    if (typeof name !== "string") {
      return false;
    }

    // Empty route name always returns false
    if (name.length === 0) {
      return false;
    }

    // null always returns false (consistent behavior)
    if (segment === null) {
      return false;
    }

    // Currying: if no segment provided, return a tester function
    if (segment === undefined) {
      return (localSegment: string) => {
        // Type check for runtime safety (consistent with direct call)
        if (typeof localSegment !== "string") {
          throw new TypeError(
            `Segment must be a string, got ${typeof localSegment}`,
          );
        }

        // Empty string returns false (consistent with direct call)
        if (localSegment.length === 0) {
          return false;
        }

        // Use buildRegex (type and empty checks already done above)
        return buildRegex(localSegment).test(name);
      };
    }

    if (typeof segment !== "string") {
      // Runtime protection: TypeScript already narrows to 'string' here,
      // but we keep this check for defense against unexpected runtime values
      throw new TypeError(`Segment must be a string, got ${typeof segment}`);
    }

    // Empty string returns false (consistent behavior)
    if (segment.length === 0) {
      return false;
    }

    // Perform the actual regex test
    // buildRegex skips type and empty checks (already validated above)
    return buildRegex(segment).test(name);
  };
};

/**
 * Pattern that matches either a dot separator or end of string.
 * Used for prefix/suffix matching that respects segment boundaries.
 */
const dotOrEnd = `(?:${escapeRegExp(ROUTE_SEGMENT_SEPARATOR)}|$)`;

/**
 * Tests if a route name starts with the given segment.
 *
 * Supports both direct calls and curried form for flexible usage patterns.
 * All segments are validated for safety (length and character constraints).
 *
 * @param route - Route state object or route name string
 * @param segment - Segment to test. If omitted, returns a tester function.
 *
 * @returns
 * - `boolean` if segment is provided (true if route starts with segment)
 * - `(segment: string) => boolean` if segment is omitted (curried tester function)
 * - `false` if segment is null or empty string
 *
 * @example
 * // Direct call
 * startsWithSegment('users.list', 'users'); // true
 * startsWithSegment('users.list', 'admin'); // false
 * startsWithSegment('admin.panel', 'users'); // false
 *
 * @example
 * // Curried form
 * const tester = startsWithSegment('users.list');
 * tester('users'); // true
 * tester('users.list'); // true
 * tester('admin'); // false
 *
 * @example
 * // With State object
 * const state: State = { name: 'users.list', params: {}, path: '/users/list' };
 * startsWithSegment(state, 'users'); // true
 *
 * @example
 * // Edge cases
 * startsWithSegment('users', ''); // false
 * startsWithSegment('users', null); // false
 * startsWithSegment('', 'users'); // false
 *
 * @throws {TypeError} If segment contains invalid characters or is not a string
 * @throws {RangeError} If segment exceeds maximum length (10,000 characters)
 *
 * @remarks
 * **Validation rules:**
 * - Allowed characters: a-z, A-Z, 0-9, dot (.), dash (-), underscore (_)
 * - Maximum segment length: 10,000 characters
 * - Empty segments are rejected
 *
 * **Performance:**
 * - No caching (RegExp compiled on each call)
 * - For high-frequency checks, consider caching results at application level
 *
 * **Segment boundaries:**
 * - Respects dot-separated segments
 * - 'users' matches 'users' and 'users.list'
 * - 'users' does NOT match 'users2' or 'admin.users'
 *
 * @see endsWithSegment for suffix matching
 * @see includesSegment for anywhere matching
 */
export const startsWithSegment = makeSegmentTester(
  "^",
  dotOrEnd,
) as SegmentTestFunction;

/**
 * Tests if a route name ends with the given segment.
 *
 * Supports both direct calls and curried form for flexible usage patterns.
 * All segments are validated for safety (length and character constraints).
 *
 * @param route - Route state object or route name string
 * @param segment - Segment to test. If omitted, returns a tester function.
 *
 * @returns
 * - `boolean` if segment is provided (true if route ends with segment)
 * - `(segment: string) => boolean` if segment is omitted (curried tester function)
 * - `false` if segment is null or empty string
 *
 * @example
 * // Direct call
 * endsWithSegment('users.list', 'list'); // true
 * endsWithSegment('users.profile.edit', 'edit'); // true
 * endsWithSegment('users.list', 'users'); // false
 *
 * @example
 * // Multi-segment suffix
 * endsWithSegment('a.b.c.d', 'c.d'); // true
 * endsWithSegment('a.b.c.d', 'b.c'); // false
 *
 * @example
 * // Curried form
 * const tester = endsWithSegment('users.list');
 * tester('list'); // true
 * tester('users'); // false
 *
 * @throws {TypeError} If segment contains invalid characters or is not a string
 * @throws {RangeError} If segment exceeds maximum length (10,000 characters)
 *
 * @remarks
 * See {@link startsWithSegment} for detailed validation rules and performance notes.
 *
 * @see startsWithSegment for prefix matching
 * @see includesSegment for anywhere matching
 */
export const endsWithSegment = makeSegmentTester(
  `(?:^|${escapeRegExp(ROUTE_SEGMENT_SEPARATOR)})`,
  "$",
) as SegmentTestFunction;

/**
 * Tests if a route name includes the given segment anywhere in its path.
 *
 * Supports both direct calls and curried form for flexible usage patterns.
 * All segments are validated for safety (length and character constraints).
 *
 * @param route - Route state object or route name string
 * @param segment - Segment to test. If omitted, returns a tester function.
 *
 * @returns
 * - `boolean` if segment is provided (true if route includes segment)
 * - `(segment: string) => boolean` if segment is omitted (curried tester function)
 * - `false` if segment is null or empty string
 *
 * @example
 * // Direct call
 * includesSegment('users.profile.edit', 'profile'); // true
 * includesSegment('users.profile.edit', 'users'); // true
 * includesSegment('users.profile.edit', 'edit'); // true
 * includesSegment('users.profile.edit', 'admin'); // false
 *
 * @example
 * // Multi-segment inclusion
 * includesSegment('a.b.c.d', 'b.c'); // true
 * includesSegment('a.b.c.d', 'a.c'); // false (must be contiguous)
 *
 * @example
 * // Curried form
 * const tester = includesSegment('users.profile.edit');
 * tester('profile'); // true
 * tester('admin'); // false
 *
 * @throws {TypeError} If segment contains invalid characters or is not a string
 * @throws {RangeError} If segment exceeds maximum length (10,000 characters)
 *
 * @remarks
 * **Important:** Segment must be contiguous in the route path.
 * - 'a.b.c' includes 'a.b' and 'b.c' but NOT 'a.c'
 *
 * See {@link startsWithSegment} for detailed validation rules and performance notes.
 *
 * @see startsWithSegment for prefix matching
 * @see endsWithSegment for suffix matching
 */
export const includesSegment = makeSegmentTester(
  `(?:^|${escapeRegExp(ROUTE_SEGMENT_SEPARATOR)})`,
  dotOrEnd,
) as SegmentTestFunction;
