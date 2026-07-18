// packages/core/src/transitionPath.ts

import { getStateMetaParams } from "./stateMetaStore";

import type { State } from "./types";

/**
 * Parameters extracted from a route segment.
 * Maps parameter names to their string values.
 */
type PrimitiveParam = string | number | boolean;

/**
 * Represents a transition path between two router states.
 * Contains information about which route segments need to be activated/deactivated.
 */
export interface TransitionPath {
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

const PRIMITIVE_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
]);

function isPrimitive(value: unknown): value is PrimitiveParam {
  return PRIMITIVE_TYPES.has(typeof value);
}

/**
 * Compares segment parameters between two states without creating intermediate objects.
 * Returns true if all primitive params for the given segment are equal in both states.
 */
function segmentParamsEqual(
  name: string,
  toMetaParams: Record<string, unknown>,
  toState: State,
  fromState: State,
): boolean {
  const keys = toMetaParams[name];

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
 * @param toMetaParams - Cached meta.params from toState (avoids per-segment WeakMap lookup)
 * @param toState - Target state
 * @param fromState - Source state
 * @param toStateIds - Segment IDs for target state
 * @param fromStateIds - Segment IDs for source state
 * @param maxI - Maximum index to check (minimum of both arrays)
 * @returns Index of first difference, or maxI if all checked segments match
 */
function pointOfDifference(
  toMetaParams: Record<string, unknown>,
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

    if (!segmentParamsEqual(toSegment, toMetaParams, toState, fromState)) {
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
// Module-global cache (shared across all router instances): bounded in practice by
// the app's route-name vocabulary, which is stable across cloneRouter() requests, so
// it does not grow per request. Intentionally NOT cleared on dispose() — it is not
// per-router, so one router's teardown must not evict entries other routers rely on.
const nameToIDsCache = new Map<string, string[]>();

export function nameToIDs(name: string): string[] {
  const cached = nameToIDsCache.get(name);

  // Stryker disable next-line BlockStatement: equivalent — dropping the cache-hit early return recomputes the identical frozen id chain (the cache is a perf optimization, not a correctness gate).
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

  // Stryker disable next-line UnaryOperator,BlockStatement: equivalent — inverting/emptying the 3-segment fast path routes the name through nameToIDsGeneral (below), which yields the identical id chain (same rationale as the L242 ArithmeticOperator disable). The ConditionalExpression/EqualityOperator siblings stay live (→true and !== are killed).
  if (thirdDot === -1) {
    return [name.slice(0, firstDot), name.slice(0, secondDot), name];
  }

  // Stryker disable next-line ArithmeticOperator: equivalent — `thirdDot - 1` makes fourthDot non-(-1), routing 5+ segment names through nameToIDsGeneral, which yields the identical id chain.
  const fourthDot = name.indexOf(ROUTE_SEGMENT_SEPARATOR, thirdDot + 1);

  // Stryker disable next-line UnaryOperator,BlockStatement: equivalent — inverting/emptying the 4-segment fast path routes the name through nameToIDsGeneral (below), which yields the identical id chain (same rationale as the L242 ArithmeticOperator disable). The ConditionalExpression/EqualityOperator siblings stay live (→true and !== are killed).
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
// Module-global (≤2 State refs); not cleared on dispose — negligible, not per-router.
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

  // ===== FAST PATH 3: Missing meta requires full reload =====
  // Single WeakMap lookup per state, reused in pointOfDifference/segmentParamsEqual
  const toMetaParams = getStateMetaParams(toState);
  const fromMetaParams = getStateMetaParams(fromState);

  if (!toMetaParams && !fromMetaParams) {
    // FAST PATH 3 (both states meta-less). Consumers that land here read the
    // result order-INSENSITIVELY, so the from-chain is returned as-is
    // (root→leaf, no reverse needed):
    //   • `shouldUpdateNode` reads `toDeactivate` by MEMBERSHIP (`.includes`).
    //   • Externally-supplied meta-less states (e.g. a plugin passing a raw
    //     `{name, params, path}` to `navigateToState`) land here. Since #1170,
    //     `navigateToState` carries the source's WeakMap meta across its writable
    //     shell, so start()/popstate states are NOT meta-less. A `replace()`
    //     survivor stays meta-less but is benign: the next transition's `toState`
    //     always carries meta (buildNavigateState), so this both-meta-less path
    //     is not reached from it.
    // (`canNavigateTo` no longer reaches this path — since #970 it builds its
    // toState WITH meta, mirroring buildNavigateState.)
    // The navigate pipeline always carries meta (buildNavigateState) → STANDARD
    // PATH below, which trims the shared ancestor and reverses correctly.
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: nameToIDs(fromState.name),
    };
  }

  // ===== STANDARD PATH: Routes with parameters =====
  const toStateIds = nameToIDs(toState.name);
  const fromStateIds = nameToIDs(fromState.name);
  // Stryker disable next-line MethodExpression: equivalent — Math.max reads one index past the shorter id array; that slot is undefined, so the `toSegment !== fromSegment` check in pointOfDifference returns the same divergence index Math.min would stop at.
  const maxI = Math.min(fromStateIds.length, toStateIds.length);

  const i = pointOfDifference(
    (toMetaParams ?? fromMetaParams) as Record<string, unknown>,
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
): TransitionPath {
  // Stryker disable BlockStatement: equivalent — both cache short-circuits below; emptying either early-return recomputes the identical TransitionPath (computeTransitionPath is deterministic for the same to/from states) and re-caches it. Restored right after.
  if (
    cached1Result !== null &&
    toState === cached1To &&
    fromState === cached1From
  ) {
    return cached1Result;
  }

  if (
    cached2Result !== null &&
    toState === cached2To &&
    fromState === cached2From
  ) {
    return cached2Result;
  }
  // Stryker restore BlockStatement

  const result = computeTransitionPath(toState, fromState);

  cached2To = cached1To;
  cached2From = cached1From;
  cached2Result = cached1Result;

  cached1To = toState;
  cached1From = fromState;
  cached1Result = result;

  return result;
}
