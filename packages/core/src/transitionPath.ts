// packages/core/src/transitionPath.ts

import type { State } from "@real-router/types";

/**
 * Parameters extracted from a route segment.
 * Maps parameter names to their string values.
 */
type PrimitiveParam = string | number | boolean;

/**
 * Represents a transition path between two router states.
 * Contains information about which route segments need to be activated/deactivated.
 */
interface TransitionPath {
  /** The common ancestor route segment where paths diverge */
  intersection: string;
  /** Route segments that need to be deactivated (in reverse order) */
  toDeactivate: string[];
  /** Route segments that need to be activated (in order) */
  toActivate: string[];
}

// Constants for better maintainability
const ROUTE_SEGMENT_SEPARATOR = ".";
const EMPTY_INTERSECTION = "";
const DEFAULT_ROUTE_NAME = "";
const FROZEN_EMPTY_ARRAY: string[] = [];

Object.freeze(FROZEN_EMPTY_ARRAY);

/**
 * Builds a reversed copy of a string array.
 * Optimization: single pass instead of creating intermediate array with .toReversed().
 *
 * @param arr - Source array
 * @returns New array with elements in reverse order
 * @internal
 */
function reverseArray(arr: string[]): string[] {
  const length = arr.length;
  const result: string[] = [];

  for (let i = length - 1; i >= 0; i--) {
    result.push(arr[i]);
  }

  return result;
}

/**
 * Handles conversion of route names with many segments (5+).
 * Internal helper for nameToIDs function.
 *
 * Uses optimized hybrid approach: split to get segments, then slice original
 * string to build cumulative paths. This approach is 65-81% faster than
 * string concatenation for typical cases (5-10 segments).
 *
 * @param name - Route name with 5 or more segments
 * @returns Array of cumulative segment IDs
 * @throws {Error} If route depth exceeds maximum allowed
 * @internal
 */
function nameToIDsGeneral(name: string): string[] {
  // We know there are at least 5 segments at this point (after fast paths)
  const segments = name.split(ROUTE_SEGMENT_SEPARATOR);
  const segmentCount = segments.length;

  // First segment is always just itself
  const ids: string[] = [segments[0]];

  // Calculate cumulative lengths and slice from original string
  // This avoids repeated string concatenation (O(k²) → O(k))
  let cumulativeLength = segments[0].length;

  for (let i = 1; i < segmentCount - 1; i++) {
    cumulativeLength += 1 + segments[i].length; // +1 for dot separator
    ids.push(name.slice(0, cumulativeLength));
  }

  // Last segment is always the full route name
  ids.push(name);

  return ids;
}

function isPrimitive(value: unknown): value is PrimitiveParam {
  const type = typeof value;

  return type === "string" || type === "number" || type === "boolean";
}

/**
 * Compares segment parameters between two states without creating intermediate objects.
 * Returns true if all primitive params for the given segment are equal in both states.
 */
function segmentParamsEqual(
  name: string,
  toState: State,
  fromState: State,
): boolean {
  const keys = toState.meta?.params[name];

  if (!keys || typeof keys !== "object") {
    return true;
  }

  for (const key of Object.keys(keys)) {
    const toVal = toState.params[key];
    const fromVal = fromState.params[key];

    if (
      isPrimitive(toVal) &&
      isPrimitive(fromVal) &&
      String(toVal) !== String(fromVal)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Finds the point where two state paths diverge based on segments and parameters.
 * Compares both segment names and their parameters to find the first difference.
 *
 * @param toState - Target state
 * @param fromState - Source state
 * @param toStateIds - Segment IDs for target state
 * @param fromStateIds - Segment IDs for source state
 * @param maxI - Maximum index to check (minimum of both arrays)
 * @returns Index of first difference, or maxI if all checked segments match
 */
function pointOfDifference(
  toState: State,
  fromState: State,
  toStateIds: string[],
  fromStateIds: string[],
  maxI: number,
): number {
  for (let i = 0; i < maxI; i++) {
    const toSegment = toStateIds[i];
    const fromSegment = fromStateIds[i];

    // Different segment names - immediate difference
    if (toSegment !== fromSegment) {
      return i;
    }

    if (!segmentParamsEqual(toSegment, toState, fromState)) {
      return i;
    }
  }

  return maxI;
}

/**
 * Converts a route name to an array of hierarchical segment identifiers.
 * Each segment ID includes all parent segments in the path.
 *
 * @param name - Route name in dot notation (e.g., 'users.profile.edit')
 * @returns Array of cumulative segment IDs
 * @throws {Error} If route depth exceeds maximum allowed depth
 *
 * @example
 * // Simple route
 * nameToIDs('users');
 * // Returns: ['users']
 *
 * @example
 * // Nested route
 * nameToIDs('users.profile.edit');
 * // Returns: ['users', 'users.profile', 'users.profile.edit']
 *
 * @example
 * // Empty string (root route)
 * nameToIDs('');
 * // Returns: ['']
 *
 * @remarks
 * Input parameter is NOT validated in this function for performance reasons.
 * Validation significantly slows down nameToIDs execution.
 * The input should be validated by the function/method that calls nameToIDs.
 */
const nameToIDsCache = new Map<string, string[]>();

export function nameToIDs(name: string): string[] {
  const cached = nameToIDsCache.get(name);

  if (cached) {
    return cached;
  }

  const result = computeNameToIDs(name);

  Object.freeze(result);
  nameToIDsCache.set(name, result);

  return result;
}

function computeNameToIDs(name: string): string[] {
  if (!name) {
    return [DEFAULT_ROUTE_NAME];
  }

  const firstDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR);

  if (firstDot === -1) {
    return [name];
  }

  const secondDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, firstDot + 1);

  if (secondDot === -1) {
    return [name.slice(0, firstDot), name];
  }

  const thirdDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, secondDot + 1);

  if (thirdDot === -1) {
    return [name.slice(0, firstDot), name.slice(0, secondDot), name];
  }

  const fourthDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, thirdDot + 1);

  if (fourthDot === -1) {
    return [
      name.slice(0, firstDot),
      name.slice(0, secondDot),
      name.slice(0, thirdDot),
      name,
    ];
  }

  return nameToIDsGeneral(name);
}

/**
 * Calculates the transition path between two router states.
 * Determines which route segments need to be deactivated and activated
 * to transition from one state to another.
 *
 * @param toState - Target state to transition to
 * @param fromState - Current state to transition from (optional)
 * @returns Transition path with intersection and segments to activate/deactivate
 *
 * @throws {TypeError} When toState is null or undefined
 * @throws {TypeError} When toState is not an object
 * @throws {TypeError} When toState.name is missing or not a string
 * @throws {TypeError} When toState.params is missing or not an object
 * @throws {TypeError} When toState.path is missing or not a string
 * @throws {TypeError} When toState.name contains invalid route format:
 *   - Contains only whitespace (e.g., "   ")
 *   - Has consecutive dots (e.g., "users..profile")
 *   - Has leading/trailing dots (e.g., ".users" or "users.")
 *   - Segments don't match pattern [a-zA-Z_][a-zA-Z0-9_-]* (e.g., "users.123")
 *   - Contains spaces or special characters (e.g., "users profile")
 *   - Exceeds maximum length (8192 characters)
 * @throws {TypeError} When fromState is provided and has any of the validation errors listed above for toState
 *
 * @example
 * // ✅ Valid calls
 * getTransitionPath({ name: 'users.profile', params: {}, path: '/users/profile' });
 * getTransitionPath(toState, fromState);
 * getTransitionPath({ name: '', params: {}, path: '/' }); // root route
 *
 * @example
 * // ❌ Invalid calls that throw TypeError
 * getTransitionPath(null);                                    // toState is null
 * getTransitionPath(undefined);                               // toState is undefined
 * getTransitionPath({});                                      // missing required fields
 * getTransitionPath({ name: 123, params: {}, path: '/' });    // name not a string
 * getTransitionPath({ name: 'home', path: '/' });             // missing params
 * getTransitionPath({ name: 'users..profile', params: {}, path: '/' }); // consecutive dots
 * getTransitionPath({ name: '.users', params: {}, path: '/' });         // leading dot
 * getTransitionPath({ name: 'users.', params: {}, path: '/' });         // trailing dot
 * getTransitionPath({ name: 'users profile', params: {}, path: '/' });  // contains space
 * getTransitionPath({ name: 'users.123', params: {}, path: '/' });      // segment starts with number
 * getTransitionPath(validToState, { name: 'invalid..route', params: {}, path: '/' }); // fromState invalid
 *
 * @example
 * // Full activation (no fromState)
 * getTransitionPath(makeState('users.profile'));
 * // Returns: {
 * //   intersection: '',
 * //   toActivate: ['users', 'users.profile'],
 * //   toDeactivate: []
 * // }
 *
 * @example
 * // Partial transition with common ancestor
 * getTransitionPath(
 *   makeState('users.profile'),
 *   makeState('users.list')
 * );
 * // Returns: {
 * //   intersection: 'users',
 * //   toActivate: ['users.profile'],
 * //   toDeactivate: ['users.list']
 * // }
 *
 * @example
 * // Complete route change
 * getTransitionPath(
 *   makeState('admin.dashboard'),
 *   makeState('users.profile')
 * );
 * // Returns: {
 * //   intersection: '',
 * //   toActivate: ['admin', 'admin.dashboard'],
 * //   toDeactivate: ['users.profile', 'users']
 * // }
 */
// Single-entry cache: shouldUpdateNode calls getTransitionPath N times per
// navigation with the same state objects (once per subscribed node).
// Cache by reference eliminates N-1 redundant computations.
let cached1To: State | undefined;
let cached1From: State | undefined;
let cached1Result: TransitionPath | null = null;

let cached2To: State | undefined;
let cached2From: State | undefined;
let cached2Result: TransitionPath | null = null;

function computeTransitionPath(
  toState: State,
  fromState?: State,
): TransitionPath {
  // ===== FAST PATH 1: Initial navigation (no fromState) =====
  // This is the best performing case in benchmarks (5M ops/sec)
  if (!fromState) {
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: FROZEN_EMPTY_ARRAY,
    };
  }

  // ===== FAST PATH 3: Missing meta or meta.params requires full reload =====
  // Check if meta or meta.params is actually missing (not just empty)
  const toHasMeta = toState.meta?.params !== undefined;
  const fromHasMeta = fromState.meta?.params !== undefined;

  if (!toHasMeta && !fromHasMeta) {
    // Both states missing meta.params - require full reload
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: reverseArray(nameToIDs(fromState.name)),
    };
  }

  // ===== STANDARD PATH: Routes with parameters =====
  // Use original algorithm for complex cases with parameters
  const toStateIds = nameToIDs(toState.name);
  const fromStateIds = nameToIDs(fromState.name);
  const maxI = Math.min(fromStateIds.length, toStateIds.length);

  // Find where paths diverge based on segments and parameters
  // not obvious validate toState and fromState
  const i = pointOfDifference(
    toState,
    fromState,
    toStateIds,
    fromStateIds,
    maxI,
  );

  // Optimization: Build deactivation list in reverse order directly
  // instead of slice(i).toReversed() which creates 2 arrays
  let toDeactivate: string[];

  if (i >= fromStateIds.length) {
    toDeactivate = FROZEN_EMPTY_ARRAY;
  } else if (i === 0 && fromStateIds.length === 1) {
    // Single-segment route: reversed = original, reuse cached frozen array
    toDeactivate = fromStateIds;
  } else {
    toDeactivate = [];

    for (let j = fromStateIds.length - 1; j >= i; j--) {
      toDeactivate.push(fromStateIds[j]);
    }
  }

  // Build activation list — reuse cached frozen array when using full list
  const toActivate = i === 0 ? toStateIds : toStateIds.slice(i);

  // Determine intersection point (common ancestor)
  const intersection = i > 0 ? fromStateIds[i - 1] : EMPTY_INTERSECTION;

  return {
    intersection,
    toDeactivate,
    toActivate,
  };
}

export function getTransitionPath(
  toState: State,
  fromState?: State,
  reload?: boolean,
): TransitionPath {
  if (reload) {
    return computeTransitionPath(toState, fromState);
  }

  if (
    cached1Result !== null &&
    toState === cached1To &&
    fromState === cached1From
  ) {
    return cached1Result;
  }

  /* v8 ignore next 6 -- @preserve: 2nd cache slot hit path exercised by alternating navigation benchmarks, not unit tests */
  if (
    cached2Result !== null &&
    toState === cached2To &&
    fromState === cached2From
  ) {
    return cached2Result;
  }

  const result = computeTransitionPath(toState, fromState);

  cached2To = cached1To;
  cached2From = cached1From;
  cached2Result = cached1Result;

  cached1To = toState;
  cached1From = fromState;
  cached1Result = result;

  return result;
}
