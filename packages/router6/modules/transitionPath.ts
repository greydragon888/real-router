// packages/router6/modules/transitionPath.ts

import { validateState } from "type-guards";

import type { Params, State } from "router6-types";

/**
 * Parameters extracted from a route segment.
 * Maps parameter names to their string values.
 */
type SegmentParams = Record<string, string>;

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

/**
 * Builds a reversed copy of a string array.
 * Optimization: single pass instead of creating intermediate array with .toReversed().
 *
 * @param arr - Source array
 * @returns New array with elements in reverse order
 * @internal
 */
function reverseArray(arr: string[]): string[] {
  const len = arr.length;
  const result: string[] = [];

  for (let i = len - 1; i >= 0; i--) {
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
  let cumulativeLen = segments[0].length;

  for (let i = 1; i < segmentCount - 1; i++) {
    cumulativeLen += 1 + segments[i].length; // +1 for dot separator
    ids.push(name.slice(0, cumulativeLen));
  }

  // Last segment is always the full route name
  ids.push(name);

  return ids;
}

/**
 * Extracts segment-specific parameters from a state object.
 * Only includes parameters that are valid for serialization (primitives).
 *
 * @param name - Segment name to extract parameters for
 * @param state - State containing the parameters
 * @returns Object with extracted segment parameters
 */
function extractSegmentParams(name: string, state: State): SegmentParams {
  const keys = state.meta?.params[name];

  // No parameters defined for this segment
  if (!keys || typeof keys !== "object") {
    return {};
  }

  const result: SegmentParams = {};

  for (const key in keys as Params) {
    // Skip inherited properties
    if (!Object.hasOwn(keys, key)) {
      continue;
    }

    // Skip undefined values for consistent behavior (treat { key: undefined } same as missing key)
    // Edge case: can appear from manual State creation or object merging
    // @ts-expect-error Params type doesn't allow undefined, but it can appear at runtime
    if (keys[key] === undefined) {
      continue;
    }

    const value = state.params[key];

    // Skip null/undefined values
    if (value == null) {
      continue;
    }

    // Check type and add to result
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = String(value);
    } else {
      // Warn about unsupported complex types (arrays, nested objects)
      // Note: After null check and primitive check, only objects remain here.
      // symbol/function/bigint are rejected by isParams validation before reaching this code.
      console.warn(
        "transitionPath.extractSegmentParams",
        `Unsupported param type for key "${key}": ${typeof value}. ` +
          `Only primitives (string, number, boolean) are supported.`,
        typeof value,
      );
    }
  }

  return result;
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

    // Same segment name - check parameters
    const toParams = extractSegmentParams(toSegment, toState);
    const fromParams = extractSegmentParams(fromSegment, fromState);

    // Fast check: different number of parameters
    const toKeys = Object.keys(toParams);
    const fromKeys = Object.keys(fromParams);

    if (toKeys.length !== fromKeys.length) {
      return i;
    }

    // Detailed check: compare parameter values
    for (const key of toKeys) {
      if (toParams[key] !== fromParams[key]) {
        return i;
      }
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
export function nameToIDs(name: string): string[] {
  // ===== FAST PATH 1: Empty string (root route) =====
  // Most common in initial navigation
  if (!name) {
    return [DEFAULT_ROUTE_NAME];
  }

  // ===== FAST PATH 2: Single segment (no dots) =====
  // Very common: 'home', 'users', 'settings', etc.
  const firstDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR);

  if (firstDot === -1) {
    return [name];
  }

  // ===== FAST PATH 3: Two segments =====
  // Common: 'users.list', 'admin.dashboard', etc.
  const secondDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, firstDot + 1);

  if (secondDot === -1) {
    return [
      name.slice(0, firstDot), // 'users'
      name, // 'users.list'
    ];
  }

  // ===== FAST PATH 4: Three segments =====
  // Common: 'users.profile.edit', 'app.settings.general', etc.
  const thirdDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, secondDot + 1);

  if (thirdDot === -1) {
    return [
      name.slice(0, firstDot), // 'users'
      name.slice(0, secondDot), // 'users.profile'
      name, // 'users.profile.edit'
    ];
  }

  // ===== FAST PATH 5: Four segments =====
  const fourthDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, thirdDot + 1);

  if (fourthDot === -1) {
    return [
      name.slice(0, firstDot),
      name.slice(0, secondDot),
      name.slice(0, thirdDot),
      name,
    ];
  }

  // ===== STANDARD PATH: 5+ segments =====
  // Less common, use general algorithm with optimizations
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
export function getTransitionPath(
  toState: State,
  fromState?: State,
): TransitionPath {
  // Validate required toState
  validateState(toState, "getTransitionPath");

  // ===== FAST PATH 1: Initial navigation (no fromState) =====
  // This is the best performing case in benchmarks (5M ops/sec)
  if (!fromState) {
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: [],
    };
  }

  // Validate optional fromState
  validateState(fromState, "getTransitionPath");

  const toStateOptions = toState.meta?.options ?? {};

  // ===== FAST PATH 2: Force reload =====
  // Skip all optimization when reload is requested
  if (toStateOptions.reload) {
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: reverseArray(nameToIDs(fromState.name)),
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

  // ===== FAST PATH 4: Same routes with empty meta.params =====
  // If both have empty meta.params {}, no parameter checking needed
  if (toState.name === fromState.name && toHasMeta && fromHasMeta) {
    const toParamsEmpty =
      toState.meta && Object.keys(toState.meta.params).length === 0;
    const fromParamsEmpty =
      fromState.meta && Object.keys(fromState.meta.params).length === 0;

    if (toParamsEmpty && fromParamsEmpty) {
      // Both have empty params - no transition needed
      return {
        intersection: toState.name,
        toActivate: [],
        toDeactivate: [],
      };
    }
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
  const toDeactivate: string[] = [];

  for (let j = fromStateIds.length - 1; j >= i; j--) {
    toDeactivate.push(fromStateIds[j]);
  }

  // Build activation list (forward order for proper initialization)
  const toActivate = toStateIds.slice(i);

  // Determine intersection point (common ancestor)
  const intersection =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    fromState && i > 0 ? fromStateIds[i - 1] : EMPTY_INTERSECTION;

  return {
    intersection,
    toDeactivate,
    toActivate,
  };
}
