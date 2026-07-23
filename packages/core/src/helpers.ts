// packages/core/src/helpers.ts

import { DEFAULT_LIMITS, EMPTY_PARAMS } from "./constants";

import type { Params, SearchParams, State, LimitsConfig } from "./types";
import type { Limits } from "./types/internal";

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
 * Single pass. When nothing survives (empty input, or every value `undefined`)
 * it returns the shared frozen `EMPTY_PARAMS` singleton, so `makeState`'s
 * `params === EMPTY_PARAMS` reuse branch fires and an empty-params navigation
 * allocates zero transient `{}` (#1027); a non-empty input returns a fresh
 * object. Either way reference identity is not preserved across calls, and the
 * result MUST be treated as read-only — callers must not mutate it (the empty
 * case is a shared frozen singleton).
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

  let normalized: Params | undefined;

  for (const key in params) {
    if (!Object.hasOwn(params, key)) {
      continue;
    }

    const value = params[key];

    if (value !== undefined) {
      // Lazy allocation: an all-empty / all-undefined input costs zero objects.
      normalized ??= {};
      normalized[key] = value;
    }
  }

  // Reuse the shared singleton when nothing survived so makeState's
  // `params === EMPTY_PARAMS` reuse branch fires (#1027).
  return normalized ?? EMPTY_PARAMS;
}

/**
 * Splits a v1-style params bag into its path and query channels by route
 * declaration: any key that is NOT a path (URL) param name of the route is a
 * query param (RFC-4 M2 / #1548). Mirrors the matcher's read-side split for the
 * navigate/build path, where the caller still passes one bag.
 *
 * `pathNames` is the route's cached URL-param list (`getUrlParams`), covering
 * ancestor path params too; undeclared keys (loose mode) fall through to
 * search, matching the matcher's loose behavior.
 *
 * `keepNames` (#1549) additionally pins keys to the params channel — the
 * route's non-query `defaultParams` keys (`getNonQueryDefaultKeys`). The bag
 * arrives with defaults already merged in (`forwardState`), so without this an
 * arbitrary default (`defaultParams: { theme: "dark" }` on a route that never
 * declared `?theme`) would be routed to search like an explicitly-passed
 * undeclared key, duplicating it across channels once `makeState` re-applies
 * the default to `params`.
 *
 * Fast path — when there are no query keys the ORIGINAL `params` is returned
 * unchanged (no copy, so an all-path or empty bag preserves the EMPTY_PARAMS
 * singleton, #1027) and `search` is `undefined` so `makeState` reuses the
 * frozen EMPTY_SEARCH.
 */
export function splitParamsBySearch(
  params: Params,
  pathNames: readonly string[],
  keepNames?: readonly string[],
): { params: Params; search: SearchParams | undefined } {
  let search: Record<string, unknown> | undefined;

  for (const key in params) {
    if (
      !Object.hasOwn(params, key) ||
      pathNames.includes(key) ||
      keepNames?.includes(key)
    ) {
      continue;
    }

    search ??= {};
    search[key] = params[key];
  }

  if (search === undefined) {
    return { params, search: undefined };
  }

  // Some query keys were split out — rebuild the path-only bag (params minus
  // the query keys). Boundary cast on `search` (like `params as P` at the
  // matcher edge): non-path keys carry query values, typed loosely as unknown.
  let pathParams: Params | undefined;

  for (const key in params) {
    if (!Object.hasOwn(params, key) || key in search) {
      continue;
    }

    pathParams ??= {};
    pathParams[key] = params[key];
  }

  return {
    params: pathParams ?? EMPTY_PARAMS,
    search: search as SearchParams,
  };
}
