// packages/route-utils/src/segmentTesters.ts

import {
  MAX_SEGMENT_LENGTH,
  ROUTE_SEGMENT_SEPARATOR,
  SAFE_SEGMENT_PATTERN,
} from "./constants";

import type { SegmentTestFunction } from "./types";
import type { State } from "@real-router/core";

/**
 * `.` as a char code — the boundary the flat comparisons test for. Matching is
 * exactly the historical regex semantics (`^seg(?:\.|$)` etc. over the escaped
 * segment) without entering the RegExp engine: for a validated segment the
 * escaped pattern is a literal, so prefix/suffix/substring checks with a
 * dot-or-edge boundary are equivalent — locked by
 * `tests/property/segmentTesters.regex-equivalence.properties.ts` (INVARIANTS: Implementation Equivalence).
 */
const DOT = ROUTE_SEGMENT_SEPARATOR.codePointAt(0);

/** `^seg(?:\.|$)` — prefix hit whose end lands on a dot or the string end. */
const matchesStart = (name: string, segment: string): boolean =>
  name.startsWith(segment) &&
  (name.length === segment.length || name.codePointAt(segment.length) === DOT);

/** `(?:^|\.)seg$` — suffix hit whose start lands on a dot or the string start. */
const matchesEnd = (name: string, segment: string): boolean =>
  name.endsWith(segment) &&
  (name.length === segment.length ||
    name.codePointAt(name.length - segment.length - 1) === DOT);

/**
 * `(?:^|\.)seg(?:\.|$)` — SOME occurrence bounded by dot-or-edge on both
 * sides. Scans every occurrence (like the regex engine): an unbounded earlier
 * hit must not mask a bounded later one (`x.b.c` in `ax.b.c.x.b.c`).
 */
const matchesAnywhere = (name: string, segment: string): boolean => {
  let index = name.indexOf(segment);

  while (index !== -1) {
    const end = index + segment.length;

    if (
      (index === 0 || name.codePointAt(index - 1) === DOT) &&
      (end === name.length || name.codePointAt(end) === DOT)
    ) {
      return true;
    }

    index = name.indexOf(segment, index + 1);
  }

  return false;
};

/**
 * Creates a segment tester function around a flat boundary predicate.
 * This is a factory function that produces the actual test functions.
 *
 * @param matches - Boundary predicate over (routeName, validated segment)
 * @returns A test function that can check if routes match the segment pattern
 * @internal
 */
const makeSegmentTester = (
  matches: (name: string, segment: string) => boolean,
) => {
  // Once-per-segment validation: a segment that passed the length + character
  // checks never re-pays them. An INVALID segment is never cached — it throws
  // on every call (same contract as the pre-flat regex cache, which also only
  // stored successfully-built patterns).
  const validatedSegments = new Set<string>();

  /**
   * Validates length and character pattern. Type and empty checks are done by
   * caller.
   *
   * This optimizes performance by avoiding redundant checks - callers verify
   * type and empty before calling this function.
   *
   * @param segment - The segment to validate (non-empty string)
   * @throws {RangeError} If segment exceeds maximum length
   * @throws {TypeError} If segment contains invalid characters
   * @internal
   */
  const validateSegment = (segment: string): void => {
    if (validatedSegments.has(segment)) {
      return;
    }

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

    validatedSegments.add(segment);
  };

  // TypeScript cannot infer conditional return type for curried function with union return.
  // The function returns either boolean or a tester function based on whether segment is provided.
  // This is an intentional design pattern for API flexibility.
  // eslint-disable-next-line sonarjs/function-return-type
  return (route: State | string, segment?: string | null) => {
    // Extract route name, handling both string and State object inputs
    // State.name is always string by real-router type definition
    const name = typeof route === "string" ? route : route.name;

    // An empty or non-string route name matches nothing, so every tester
    // ultimately returns `false`. But this MUST NOT short-circuit before the
    // currying branch: the single-arg overload unconditionally promises a
    // tester function, so the name check is deferred to each return path
    // (curried body + direct form) instead of running up front (#769).
    const invalidName = typeof name !== "string" || name.length === 0;

    // null always returns false (consistent behavior)
    if (segment === null) {
      return false;
    }

    // Currying: if no segment provided, return a tester function
    if (segment === undefined) {
      return (localSegment: string) => {
        // Type check for runtime safety. NOT consistent with the direct call for
        // `null`: the direct form has a `segment === null → false` guard above,
        // but this curried `(segment: string) => boolean` form has no null branch,
        // so a non-string (incl. null) throws here. Curried/direct equivalence
        // holds for string segments only (INVARIANTS Inv 5).
        if (typeof localSegment !== "string") {
          throw new TypeError(
            `Segment must be a string, got ${typeof localSegment}`,
          );
        }

        // Empty string returns false (consistent with direct call)
        if (localSegment.length === 0) {
          return false;
        }

        // An empty/non-string route name matches nothing (deferred from the
        // outer guard so the single-arg form still yields a function, #769).
        if (invalidName) {
          return false;
        }

        // Validate once per segment (type and empty checks already done above)
        validateSegment(localSegment);

        return matches(name, localSegment);
      };
    }

    // An empty/non-string route name matches nothing. Checked BEFORE the
    // segment-type guard so the direct form keeps its original output for an
    // invalid name (`false`, never a TypeError from the segment check) (#769).
    if (invalidName) {
      return false;
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

    // Perform the actual boundary test
    // validateSegment skips type and empty checks (already validated above)
    validateSegment(segment);

    return matches(name, segment);
  };
};

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
 *
 * @example
 * // Curried form
 * const tester = startsWithSegment('users.list');
 * tester('users'); // true
 * tester('admin'); // false
 *
 * @example
 * // With State object
 * const state: State = { name: 'users.list', params: {}, path: '/users/list' };
 * startsWithSegment(state, 'users'); // true
 *
 * @throws {TypeError} If segment contains invalid characters or is not a string
 * @throws {RangeError} If segment exceeds maximum length (10,000 characters)
 *
 * @see endsWithSegment for suffix matching
 * @see includesSegment for anywhere matching
 */
export const startsWithSegment = makeSegmentTester(
  matchesStart,
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
 * @see startsWithSegment for prefix matching
 * @see includesSegment for anywhere matching
 */
export const endsWithSegment = makeSegmentTester(
  matchesEnd,
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
 *
 * @example
 * // Multi-segment inclusion
 * includesSegment('a.b.c.d', 'b.c'); // true
 * includesSegment('a.b.c.d', 'a.c'); // false (must be contiguous)
 *
 * @throws {TypeError} If segment contains invalid characters or is not a string
 * @throws {RangeError} If segment exceeds maximum length (10,000 characters)
 *
 * @see startsWithSegment for prefix matching
 * @see endsWithSegment for suffix matching
 */
export const includesSegment = makeSegmentTester(
  matchesAnywhere,
) as SegmentTestFunction;
