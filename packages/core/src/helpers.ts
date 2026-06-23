// packages/core/src/helpers.ts

import { DEFAULT_LIMITS } from "./constants";

import type { Limits } from "./types";
import type { Params, State, LimitsConfig } from "@real-router/types";

// =============================================================================
// State Helpers
// =============================================================================

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
  // `Object.freeze` returns non-objects (incl. null/undefined) unchanged, so the
  // former `if (!state) return state` guard was redundant — callers also gate it
  // (`state ? freezeStateInPlace(state) : undefined`) and `T extends State` is
  // typed non-null.
  return Object.freeze(state);
}

/**
 * Merges user limits with defaults.
 * Returns frozen object for immutability.
 */
export function createLimits(userLimits: Partial<LimitsConfig> = {}): Limits {
  return { ...DEFAULT_LIMITS, ...userLimits };
}

// =============================================================================
// Params Helpers
// =============================================================================

/**
 * Strips `undefined` values from a params object before handoff to the query
 * string engine and state storage.
 *
 * **Why this exists:** `router.navigate(name, { x: undefined })` must not put
 * `x` into the resulting URL (publicly documented contract). The underlying
 * query engine (`search-params`) already does this, but the contract belongs
 * to `@real-router/core` — this function guarantees it at the core boundary
 * so that:
 * - Plugin interceptors on `forwardState` that inject `undefined` values are
 *   caught before they reach the engine
 * - `state.params` never contains `undefined` values (roundtrip consistent
 *   with URL)
 * - The contract is verifiable at core's own test surface (doesn't depend on
 *   engine behavior for regression detection)
 *
 * Single pass. Always returns a fresh object when input is defined
 * (reference identity is not preserved — callers must not rely on it).
 */
export function normalizeParams(params: Params): Params;

export function normalizeParams(params: undefined): undefined;

export function normalizeParams(params: Params | undefined): Params | undefined;

export function normalizeParams(
  params: Params | undefined,
): Params | undefined {
  if (params === undefined) {
    return params;
  }

  const normalized: Params = {};

  for (const key in params) {
    if (!Object.hasOwn(params, key)) {
      continue;
    }

    const value = params[key];

    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}
