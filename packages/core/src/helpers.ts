// packages/real-router/modules/helpers.ts

import type { State, Options } from "core-types";
import type { BuildOptions, TrailingSlashMode } from "route-tree";

export { getTypeDescription } from "type-guards";

// =============================================================================
// State Helpers (migrated from router-error)
// =============================================================================

/**
 * Simple type guard for State object structure.
 * Checks for required fields: name, params, path.
 *
 * @param value - Value to check
 * @returns true if value has State structure
 * @internal
 */
function isState(value: unknown): value is State {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.name === "string" &&
    typeof obj.path === "string" &&
    typeof obj.params === "object" &&
    obj.params !== null
  );
}

/**
 * Deep freezes State object to prevent mutations.
 * Creates a deep clone first, then recursively freezes the clone and all nested objects.
 * Uses simple recursive freezing after cloning (no need for WeakSet since clone has no circular refs).
 *
 * @param state - The State object to freeze
 * @returns A frozen deep clone of the state
 * @throws {TypeError} If state is not a valid State object
 *
 * @example
 * const state = { name: 'home', params: {}, path: '/' };
 * const frozen = deepFreezeState(state);
 * // frozen.params is now immutable
 * // original state is unchanged
 */
export function deepFreezeState<T extends State>(state: T): T {
  // Early return for null/undefined
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!state) {
    return state;
  }

  // Validate State structure
  if (!isState(state)) {
    throw new TypeError(
      `[deepFreezeState] Expected valid State object, got: ${typeof state}`,
    );
  }

  // Create a deep clone to avoid mutating the original
  // structuredClone preserves circular references, so we need to track visited objects
  const clonedState = structuredClone(state);

  // WeakSet to track visited objects (prevent infinite recursion with circular refs)
  const visited = new WeakSet<object>();

  // Recursive freeze function with circular reference protection
  function freezeClonedRecursive(obj: unknown): void {
    // Skip primitives, null, undefined
    // Note: typeof undefined === "undefined" !== "object", so checking undefined is redundant
    if (obj === null || typeof obj !== "object") {
      return;
    }

    // Skip already visited objects (circular reference protection)
    if (visited.has(obj)) {
      return;
    }

    // Mark as visited
    visited.add(obj);

    // Freeze the object/array itself
    Object.freeze(obj);

    // Get all values to freeze recursively
    const values = Array.isArray(obj) ? obj : Object.values(obj);

    // Recursively freeze nested values
    for (const value of values) {
      freezeClonedRecursive(value);
    }
  }

  // Freeze the entire cloned state tree
  freezeClonedRecursive(clonedState);

  return clonedState;
}

// WeakSet to track already frozen root objects for O(1) re-freeze check
const frozenRoots = new WeakSet<object>();

// Module-scope recursive freeze function - better JIT optimization, no allocation per call
function freezeRecursive(obj: unknown): void {
  // Skip primitives, null
  if (obj === null || typeof obj !== "object") {
    return;
  }

  // Skip already frozen objects (handles potential shared refs)
  if (Object.isFrozen(obj)) {
    return;
  }

  // Freeze the object/array
  Object.freeze(obj);

  // Iterate without Object.values() allocation
  if (Array.isArray(obj)) {
    for (const item of obj) {
      freezeRecursive(item);
    }
  } else {
    for (const key in obj) {
      freezeRecursive((obj as Record<string, unknown>)[key]);
    }
  }
}

/**
 * Freezes State object in-place without cloning.
 * Optimized for hot paths where state is known to be a fresh object.
 *
 * IMPORTANT: Only use this when you know the state is a fresh object
 * that hasn't been exposed to external code yet (e.g., from makeState()).
 *
 * @param state - The State object to freeze (must be a fresh object)
 * @returns The same state object, now frozen
 * @internal
 */
export function freezeStateInPlace<T extends State>(state: T): T {
  // Early return for null/undefined - state from makeState() is never null
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!state) {
    return state;
  }

  // Fast path: already processed root object - O(1) check
  if (frozenRoots.has(state)) {
    return state;
  }

  // Freeze the entire state tree
  freezeRecursive(state);

  // Mark root as processed for future calls
  frozenRoots.add(state);

  return state;
}

// =============================================================================
// Route Options Helpers
// =============================================================================

/**
 * Maps real-router trailingSlash option to route-tree's trailingSlashMode.
 *
 * @param trailingSlash - real-router trailing slash option
 * @returns route-tree trailing slash mode
 * @internal
 */
function mapTrailingSlashMode(
  trailingSlash: Options["trailingSlash"],
): TrailingSlashMode {
  switch (trailingSlash) {
    case "never": {
      return "never";
    }
    case "always": {
      return "always";
    }
    default: {
      return "default";
    }
  }
}

/**
 * Creates route-tree BuildOptions from real-router Options.
 * Used for buildPath caching in routerLifecycle.ts.
 *
 * @param options - real-router options
 * @returns route-tree build options
 */
export function createBuildOptions(options: Options): BuildOptions {
  const buildOptions: BuildOptions = {
    trailingSlashMode: mapTrailingSlashMode(options.trailingSlash),
    queryParamsMode: options.queryParamsMode,
    urlParamsEncoding: options.urlParamsEncoding,
  };

  // Only include queryParams if defined (exactOptionalPropertyTypes)
  if (options.queryParams !== undefined) {
    buildOptions.queryParams = options.queryParams;
  }

  return buildOptions;
}
