// packages/core/src/helpers.ts

import { DEFAULT_LIMITS } from "./constants";

import type { Limits } from "./types";
import type { State, LimitsConfig } from "@real-router/types";

// =============================================================================
// State Helpers
// =============================================================================

/**
 * Structural type guard for State object.
 * Only checks required fields exist with correct types.
 * Does NOT validate params serializability (allows circular refs).
 *
 * Use `isState` from type-guards for full validation (serializable params).
 * Use this for internal operations like deepFreezeState that handle any object structure.
 *
 * @param value - Value to check
 * @returns true if value has State structure
 * @internal
 */
function isStateStructural(value: unknown): value is State {
  if (value === null || typeof value !== "object") {
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

  // Validate State structure (structural check, allows circular refs)
  if (!isStateStructural(state)) {
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

    // Iterate without Object.values() allocation
    if (Array.isArray(obj)) {
      for (const item of obj) {
        freezeClonedRecursive(item);
      }
    } else {
      for (const key in obj) {
        freezeClonedRecursive((obj as Record<string, unknown>)[key]);
      }
    }
  }

  // Freeze the entire cloned state tree
  freezeClonedRecursive(clonedState);

  return clonedState;
}

/**
 * Shallow-freezes a State object in place.
 *
 * Freezes only the top-level State object (blocks reassignment of `name`,
 * `params`, `path`, `transition`, `context`). Nested objects (`params`,
 * `transition`, `transition.segments`, `transition.segments.{deactivated,activated}`)
 * are expected to be **already frozen at creation time** by their producers:
 *
 * - `params` frozen in `makeState()` / `navigateToNotFound()`
 * - `transition`, `segments`, `deactivated`, `activated` frozen in
 *   `buildTransitionMeta()` (or inline in `navigateToNotFound()`)
 *
 * `state.context` is **intentionally not frozen** — plugins write to it via
 * `claim.write(state, value)` after state creation.
 *
 * @internal
 */
export function freezeStateInPlace<T extends State>(state: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard against external misuse
  if (!state) {
    return state;
  }

  return Object.freeze(state);
}

/**
 * Merges user limits with defaults.
 * Returns frozen object for immutability.
 */
export function createLimits(userLimits: Partial<LimitsConfig> = {}): Limits {
  return { ...DEFAULT_LIMITS, ...userLimits };
}
