// packages/core/src/helpers.ts

import { DEFAULT_LIMITS, EMPTY_PARAMS } from "./constants";

import type { Params, SearchParams, State, LimitsConfig } from "./types";
import type { Limits } from "./types/internal";

// =============================================================================
// Channel separation (RFC-4 M2 / #1548, #1549)
// =============================================================================

/**
 * THE single point where the path / query channels are separated by
 * declaration (#1549). A DECLARED `?key` that rides in the `params` bag — a
 * plugin's `forwardState` injection (persistent-params on `start()`), a
 * decoder-injected key, a v1 single-bag `navigate(name, { q })` — moves to the
 * query channel; everything else stays a path param. An explicit `search` value
 * wins over a params-bag twin (the #843 collision precedence).
 *
 * Every State producer routes through this ONE function — `makeState` (the state
 * factory) and the `matchPath` URL rebuild — so `state.path` and `state.search`
 * can never derive from differently-split bags. Returns the inputs untouched (no
 * allocation) when there is nothing to route: no params, no declared query
 * names, or no declared key actually riding in the params bag (the common path).
 */
export function separateChannels(
  params: Params | undefined,
  queryNames: readonly string[],
  search: SearchParams,
): { params: Params | undefined; search: SearchParams };

export function separateChannels(
  params: Params | undefined,
  queryNames: readonly string[],
  search: SearchParams | undefined,
): { params: Params | undefined; search: SearchParams | undefined };

export function separateChannels(
  params: Params | undefined,
  queryNames: readonly string[],
  search: SearchParams | undefined,
): { params: Params | undefined; search: SearchParams | undefined } {
  if (params === undefined || queryNames.length === 0) {
    return { params, search };
  }

  let routedParams: Params | undefined;
  let routedQuery: Record<string, unknown> | undefined;

  for (const [key, value] of Object.entries(params)) {
    if (queryNames.includes(key)) {
      routedQuery ??= {};
      routedQuery[key] = value;
    } else {
      routedParams ??= {};
      routedParams[key] = value;
    }
  }

  if (routedQuery === undefined) {
    // No declared query name rode in the params bag — channels already canonical.
    return { params, search };
  }

  // `search` wins over a params-bag twin via the spread order (#843).
  return {
    params: routedParams,
    search: { ...routedQuery, ...search } as SearchParams,
  };
}

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
