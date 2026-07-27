// packages/core/src/helpers.ts

import { DEFAULT_LIMITS, DEFAULT_TRANSITION, EMPTY_PARAMS } from "./constants";

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
// Channel guard — detect, never normalise (#1572)
// =============================================================================

/**
 * THE predicate of the always-on channel guard: the first key the caller put in
 * the PATH bag while the route declares it as a QUERY param, or `undefined`
 * when the bag is channel-correct.
 *
 * A DETECTOR, not a normaliser — the key is never moved. Moving it is what
 * {@link separateChannels} (stage ②) does, and the nav-pipeline design removes
 * that stage precisely so channel-correctness becomes the producer's contract
 * rather than a repair the pipeline performs behind everyone's back.
 *
 * Scans `queryNames` (a route's declared query names — small, cached) rather
 * than the bag, so there is no `Object.keys` allocation, and short-circuits on
 * a route with no query declarations, which is the common case.
 *
 * `undefined` is absence on both sides (#1550 / #1551), so an
 * `undefined`-valued key is NOT a mis-channel: it is the documented removal
 * marker `persistent-params` relies on, and it never reaches a built state
 * anyway. A name that also occupies a path slot (`/items/:id?id`) is absent
 * from `queryNames` by construction (#843 / #1549 carve-out), so the collision
 * form is legitimately path-owned and passes.
 *
 * @internal
 */
export function findMisChanneledKey(
  params: Params | undefined,
  queryNames: readonly string[],
): string | undefined {
  if (queryNames.length === 0 || params === undefined) {
    return undefined;
  }

  for (const key of queryNames) {
    if (!Object.hasOwn(params, key)) {
      continue;
    }

    let value: unknown;

    try {
      value = params[key];
    } catch {
      // A DIAGNOSTIC must never become the thing that throws. The bag may be
      // backed by accessors (a Proxy, a getter, a framework's reactive object),
      // and reading one here happens EARLIER than any consumer would have read
      // it — so an accessor that throws would surface from the guard instead of
      // from the code that actually needed the value, moving the origin of an
      // existing failure. Treat it as "nothing to report" and let the real
      // consumer hit the same accessor exactly as it did before.
      return undefined;
    }

    if (value !== undefined) {
      return key;
    }
  }

  return undefined;
}

/**
 * The guard's actionable message. One builder for every position, so the
 * wording a user sees does not depend on which door they came through.
 *
 * @internal
 */
export function misChanneledKeyMessage(
  routeName: string,
  key: string,
  source = "the `params` argument",
): string {
  return `Route "${routeName}" declares \`${key}\` as a query param, but it was passed in ${source} — the path channel. Pass it in \`search\` instead; the two channels are separate since RFC-4 M2.`;
}

// =============================================================================
// Default merge — `undefined` ≡ absence (#1550 / #1551)
// =============================================================================

/**
 * Merges a route default UNDER a value (the value wins), treating `undefined` as
 * **absence on both sides** (#1550 / #1551).
 *
 * A key survives only when its winning value is defined:
 * - `mergeDefined({ page: "1" }, { page: undefined })` → `{ page: "1" }` — an
 *   explicit `undefined` from the caller does not outrank the default (this is
 *   what the path channel always did via `normalizeParams`, and what the query
 *   channel did not, #1550);
 * - `mergeDefined({ q: undefined }, undefined)` → `{}` — a default that itself
 *   carries `undefined` behaves exactly like no default entry, instead of
 *   leaking an `undefined`-valued own key into the frozen state (#1551).
 *
 * Because the rule lives in the merge rather than in a separately-ordered
 * "normalize" stage, it holds for every producer and cannot be reintroduced by
 * whichever side is merged last.
 *
 * Allocation contract: **may return the `value` argument itself** when there is
 * no default and nothing to strip (the hot path — callers pass an
 * already-normalized bag), so a caller that freezes or stores the result must
 * copy it first. `undefined` in ⇒ `undefined` out when there is no default, which
 * keeps the matcher's single-bag fallback (`search ?? params`) reachable.
 */
export function mergeDefined<T extends Record<string, unknown>>(
  defaultValue: T,
  value: T | undefined,
): T;

export function mergeDefined<T extends Record<string, unknown>>(
  defaultValue: T | undefined,
  value: T,
): T;

export function mergeDefined<T extends Record<string, unknown>>(
  defaultValue: T | undefined,
  value: T | undefined,
): T | undefined;

export function mergeDefined<T extends Record<string, unknown>>(
  defaultValue: T | undefined,
  value: T | undefined,
): T | undefined {
  if (defaultValue === undefined) {
    return stripUndefined(value);
  }

  const merged: Record<string, unknown> = {};

  for (const key in defaultValue) {
    if (Object.hasOwn(defaultValue, key) && defaultValue[key] !== undefined) {
      merged[key] = defaultValue[key];
    }
  }

  if (value !== undefined) {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) {
        continue;
      }

      // `undefined` means "I said nothing", so the default keeps the slot.
      if (value[key] === undefined) {
        continue;
      }

      merged[key] = value[key];
    }
  }

  return merged as T;
}

/**
 * Drops `undefined`-valued own keys, returning the input **unchanged** when there
 * are none (no allocation on the common path). `undefined` in ⇒ `undefined` out —
 * unlike {@link normalizeParams}, which collapses an all-`undefined` bag to the
 * shared `EMPTY_PARAMS` singleton and is the path-channel entry guard.
 */
function stripUndefined<T extends Record<string, unknown>>(
  value: T | undefined,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  let stripped: Record<string, unknown> | undefined;

  for (const key in value) {
    if (!(Object.hasOwn(value, key) && value[key] === undefined)) {
      continue;
    }

    stripped ??= { ...value };

    delete stripped[key];
  }

  return (stripped as T | undefined) ?? value;
}

// =============================================================================
// Param value comparison (#1554)
// =============================================================================

/** The value types a channel prints into (and parses back from) a URL. */
const PRINTABLE_TYPES = new Set(["string", "number", "boolean"]);

/** A value the two channels can carry across a URL round-trip. */
function isPrintableScalar(value: unknown): value is string | number | boolean {
  return PRINTABLE_TYPES.has(typeof value);
}

/**
 * Compares two param / query values for equality **independently of where they
 * came from** (#1554).
 *
 * The two directions produce different value DOMAINS for the same location: the
 * URL direction parses (`?page=2` → `2`, `?a=1&a=2` → `[1, 2]`, a path slot is
 * always a string), the intent direction keeps whatever the caller supplied
 * (`{ page: "2" }` stays a string). Both build the SAME `state.path`, so a
 * `===`-based comparison reported a URL-derived state and an intent-derived
 * state on one location as UNEQUAL — an active link rendered inactive.
 *
 * The rule is therefore "equal when both values print the same query string":
 * - **scalars** (string / number / boolean) compare by their printed form, so
 *   `2 ≡ "2"` and `true ≡ "true"`;
 * - **arrays** compare element-wise under the same rule, and a **singleton
 *   array** compares against a bare scalar (`["1"]` and `1` both print `?a=1`);
 * - everything else (`null`, `undefined`, objects) keeps strict semantics —
 *   those print differently (`?a` vs `?a=` vs nothing at all), so tolerating
 *   them would equate genuinely different URLs.
 *
 * Value normalization is deliberately NOT done: `state.search` keeps the mixed
 * domain (RFC-4 M2 / §10.14 decision (б)) and comparison is the single place
 * that knows the two domains describe the same location. Unifying the domain
 * itself belongs to the typed search-schema stage.
 */
export function areParamValuesEqual(val1: unknown, val2: unknown): boolean {
  if (val1 === val2) {
    return true;
  }

  if (Array.isArray(val1)) {
    // A singleton array prints exactly like its element (`["1"]` and `1` both
    // print `?a=1`), so compare across the shape instead of rejecting on it.
    if (!Array.isArray(val2)) {
      return val1.length === 1 && areParamValuesEqual(val1[0], val2);
    }

    if (val1.length !== val2.length) {
      return false;
    }

    // eslint-disable-next-line unicorn/no-for-loop -- hot path: for-of entries() allocates iterator per recursive call
    for (let i = 0; i < val1.length; i++) {
      if (!areParamValuesEqual(val1[i], val2[i])) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(val2)) {
    return val2.length === 1 && areParamValuesEqual(val1, val2[0]);
  }

  return (
    isPrintableScalar(val1) &&
    isPrintableScalar(val2) &&
    String(val1) === String(val2)
  );
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
 * Merges a channel's route default UNDER a routed value (the value wins) and
 * freezes the result. Reuses the shared frozen `empty` singleton (EMPTY_PARAMS /
 * EMPTY_SEARCH, #1027) when there is neither a default nor a value — so the hot
 * path (no defaults, empty params) allocates zero objects. A defaulted channel
 * always spreads (a fresh frozen object); an undefined-default channel freezes a
 * copy of the value (never the caller's object).
 *
 * `undefined` is absence on BOTH sides (`mergeDefined`, #1550 / #1551): an
 * explicitly-`undefined` caller value leaves the default in place, and a default
 * that carries `undefined` behaves like no entry — so the frozen state never
 * exposes an `undefined`-valued own key on either channel.
 *
 * Lives here, not in a namespace, because stage ③ (`applyDefaults`) has TWO
 * callers since the pipeline landed — `StateNamespace.makeState` and
 * `pipeline/canonicalize` — and a second copy of "default under value" would be
 * a second source of truth for the rule, the same drift trap #1550/#1551 closed
 * by collapsing the four merge sites onto `mergeDefined`.
 *
 * @internal
 */
export function mergeWithDefault(
  defaultValue: Record<string, unknown> | undefined,
  value: Record<string, unknown> | undefined,
  empty: Readonly<Record<string, never>>,
): Readonly<Record<string, unknown>> {
  if (defaultValue !== undefined) {
    return Object.freeze(mergeDefined(defaultValue, value));
  }

  if (value === undefined || value === empty) {
    return empty;
  }

  // `mergeDefined` returns the argument itself when there is nothing to strip,
  // so copy before freezing — the caller's bag must never be frozen.
  const defined = mergeDefined(undefined, value);

  return Object.freeze(defined === value ? { ...value } : defined);
}

/**
 * THE shape of a router State — one constructor for both producers
 * (`StateNamespace.makeState` and `pipeline/materialize`). Channels arrive
 * already merged and frozen (`mergeWithDefault`); `path` arrives already built.
 *
 * `skipFreeze` governs the freeze of the STATE OBJECT only — never the channels.
 * `params` / `search` are frozen at merge time regardless, so a state handed to
 * a guard mid-pipeline (`skipFreeze: true`, the navigate path) still exposes
 * immutable bags while `completeTransition` is free to attach `transition`.
 *
 * `context` is a fresh empty object, intentionally NOT frozen — plugins publish
 * into it via `claim.write(state, value)` after creation.
 *
 * @internal
 */
export function createStateObject<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
>(
  name: string,
  params: P,
  search: S,
  path: string,
  skipFreeze?: boolean,
): State<P, S> {
  const state = {
    name,
    params,
    search,
    path,
    context: {},
    ...(!skipFreeze && { transition: DEFAULT_TRANSITION }),
  } as State<P, S>;

  return skipFreeze ? state : freezeStateInPlace(state);
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
