// packages/core/src/helpers.ts

import { EMPTY_PARAMS, UNSAFE_KEY } from "./constants";

import type { Params, State } from "./types";

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
    // `merged[UNSAFE_KEY] = …` would replace `merged`'s prototype rather than
    // add an entry (#1792) — the copy simply does not carry that name.
    if (
      key !== UNSAFE_KEY &&
      Object.hasOwn(defaultValue, key) &&
      defaultValue[key] !== undefined
    ) {
      merged[key] = defaultValue[key];
    }
  }

  if (value !== undefined) {
    for (const key in value) {
      // Same rule as the default loop above (#1792).
      if (key === UNSAFE_KEY || !Object.hasOwn(value, key)) {
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
    // ⚑ `__proto__` forces the copy even when nothing else does (#1792): the
    // spread below DEFINES, so without this the key would ride out as a real
    // own property, and without forcing the copy the input would be returned
    // by reference with the key still on it.
    if (Object.hasOwn(value, key) && key === UNSAFE_KEY) {
      stripped ??= { ...value };

      delete stripped[UNSAFE_KEY];

      continue;
    }

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
 * Freezes the State object's own level — the SHELL, not the state.
 *
 * Named for what it does after #1599: it used to be called
 * `freezeStateInPlace`, which promised a depth it has never delivered, and
 * `CLAUDE.md` described it as "consolidated into one recursive traversal" long
 * after the traversal was gone. It blocks reassignment of `name` / `params` /
 * `search` / `path` / `transition` / `context` and nothing more.
 *
 * **The depth is a POLICY, not this function's job: every object is frozen once,
 * where it is created.** That is deliberate and measured — re-freezing an
 * already-frozen object costs ~8 ns, so a recursive walk would pay per node for
 * work its producers already did. The four producers and what each owns:
 *
 * - `params` — {@link mergeWithDefault} on the slow path; on the fast one there is
 *   no merge to freeze it, so `pipeline/materialize` does at the publication
 *   boundary (#1598), before its own `skipFreeze` branch
 * - `search` — the `EMPTY_SEARCH` singleton, or `admittedSearch`
 *   (`channels/modeGate.ts`) on its DROP branch, the one branch that builds a bag
 *   the caller did not already freeze
 * - `transition` + nested — `buildTransitionMeta()` (or inline in
 *   `navigateToNotFound()`)
 * - the shell — here
 *
 * `state.context` is **intentionally not frozen** — plugins write to it via
 * `claim.write(state, value)` after state creation.
 *
 * The whole matrix is pinned black-box in
 * `tests/functional/error/helpers.test.ts` ("state immutability across every
 * producer"), mutationally validated against all four sites. Before #1599 two of
 * them were unguarded: deleting the `canonicalize` freeze left the entire suite
 * green, and the mode gate's freeze was reachable only under a non-`loose` mode
 * with one key dropped AND one admitted.
 *
 * @internal
 */
export function freezeStateShell<T extends State>(state: T): T {
  // `Object.freeze` returns non-objects (incl. null/undefined) unchanged, so the
  // former `if (!state) return state` guard was redundant — every caller reaches
  // here with a state in hand (the commit `update` on the table, `materialize`'s
  // publication boundary) and `T extends State` is typed non-null.
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
 * `valueIsOwned` says the caller minted `value` itself and nothing else holds a
 * reference — then the defensive copy is skipped and the bag is frozen in place
 * (#1589). Only `canonicalize`'s PATH channel may pass it, because only there is
 * the value the fresh object `normalizeParams` just returned. Passing it for a
 * bag that came from user code would freeze the caller's object.
 *
 * Lives here, not in a namespace, because the rule outlived its call count:
 * stage ③ (`applyDefaults`) had TWO callers when the pipeline landed
 * (`StateNamespace.makeState` and `pipeline/canonicalize`) and has ONE since
 * Phase 4 folded the first onto the second — but the chain fold in
 * `RoutesNamespace` still layers hop defaults through `mergeDefined` directly,
 * so a second copy of "default under value" would be a second source of truth
 * for the rule, the same drift trap #1550/#1551 closed
 * by collapsing the four merge sites onto `mergeDefined`.
 *
 * @internal
 */
export function mergeWithDefault(
  defaultValue: Record<string, unknown> | undefined,
  value: Record<string, unknown> | undefined,
  empty: Readonly<Record<string, never>>,
  valueIsOwned = false,
): Readonly<Record<string, unknown>> {
  if (defaultValue !== undefined) {
    return Object.freeze(mergeDefined(defaultValue, value));
  }

  if (value === undefined || value === empty) {
    return empty;
  }

  // OWNED value: freeze in place. The copy below exists solely so the CALLER's
  // bag is never frozen out from under it — when the bag was minted one line
  // earlier by `normalizeParams` (which always returns a fresh object or the
  // frozen `empty` singleton, never its input) there is no caller to protect,
  // and `undefined` values are already stripped, so `mergeDefined`'s walk is
  // redundant too. Measured on #1589: without this the path channel is copied
  // TWICE per producer call — once to normalize, once to freeze — on `navigate`,
  // `buildPath`, `matchPath`, `isActiveRoute` and `canNavigateTo` alike.
  if (valueIsOwned) {
    return Object.freeze(value);
  }

  // `mergeDefined` returns the argument itself when there is nothing to strip,
  // so copy before freezing — the caller's bag must never be frozen.
  const defined = mergeDefined(undefined, value);

  // ⚑ No `__proto__` guard on this spread, deliberately. `mergeDefined` above
  // routes every path through `stripUndefined`, which FORCES a copy when the key
  // is present — so `defined === value` here implies the key is absent, and a
  // guard would be a branch no input can take. Verified by mutation: adding one
  // leaves it uncovered.
  return Object.freeze(defined === value ? { ...value } : defined);
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
 * it returns the shared frozen `EMPTY_PARAMS` singleton, so the merge's
 * `value === empty` reuse branch (`mergeWithDefault`) fires and an empty-params
 * navigation allocates zero transient `{}` (#1027); a non-empty input returns a fresh
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

    // `normalized[UNSAFE_KEY] = …` reaches the inherited setter and would
    // replace this fresh object's prototype (#1792). Skipped, so the path
    // channel cannot carry the name whatever the caller wrote.
    if (key === UNSAFE_KEY) {
      continue;
    }

    const value = params[key];

    if (value !== undefined) {
      // Lazy allocation: an all-empty / all-undefined input costs zero objects.
      normalized ??= {};
      normalized[key] = value;
    }
  }

  // Reuse the shared singleton when nothing survived so the merge's
  // `value === empty` reuse branch fires (#1027).
  return normalized ?? EMPTY_PARAMS;
}
