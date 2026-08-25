// packages/core/src/helpers.ts

import { UNSAFE_KEY } from "./constants";
import { putField } from "./utils/ingest";

import type { State } from "./types";

/**
 * Intrinsics captured at module load: `freeze`, `hasOwn`, `objectKeys`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — the ordinary
 * polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
 * reproduces #1798 verbatim (`buildPath` prints the native method into the
 * URL). Two earlier revisions of this header said "before any application
 * code can run", which is the sentence a future reader would have trusted.
 */
const freeze = Object.freeze;
const hasOwn = Object.hasOwn;
// ⚑ Captured for the same reason as its two siblings above, and it matters more
// here than for either: since #1854 this is the OWN-NESS gate for both channels,
// so an application that re-points `Object.keys` after boot would be re-pointing
// the guard itself. `dependenciesStore` captures it for the same door.
const objectKeys = Object.keys;
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
 *   what the path channel always did via `normalizeChannel`, and what the query
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

  // ⚑ `Object.keys`, for the reason `normalizeChannel` above carries (#1854) —
  // and this door is the SIBLING, found by probing it rather than by reasoning
  // from the other one. A route's `defaultParams` / `defaultSearch` is a bag the
  // application still holds and may be Proxy-backed, and measured before the
  // change a lying `getOwnPropertyDescriptor` put an inherited key into
  // `state.params` while `state.path` printed without it — the same
  // state-contradicts-its-own-URL outcome, one function away.
  for (const key of objectKeys(defaultValue)) {
    // Dropped from the published channel, same rule as the entry guard (#1852).
    if (key === UNSAFE_KEY) {
      continue;
    }

    // One read here too: a route default is a bag the app still holds.
    const entry = defaultValue[key];

    if (entry !== undefined) {
      putField(merged, key, entry);
    }
  }

  if (value !== undefined) {
    // ⚑ `objectKeys`, one spelling across this file — and the reason it FINALLY
    // moved is worth recording, because for two releases the note here argued
    // the opposite. It said the `for…in` + `hasOwn` form was dormant but
    // unpinnable: no public path could put a lying bag in front of it, so
    // nothing would go red if the edit were reverted. True, and it stopped being
    // the whole story when #1852 retired the `UNSAFE_KEY` skips: the `continue`
    // in these loops was reachable ONLY through that skip's `||` arm, so
    // removing it left `!hasOwn` as a branch no test could take. Dead code plus
    // a coverage exemption is worse than either, and `objectKeys` removes the
    // branch by construction while buying the #1854 property for free.
    //
    // ⚠ Do NOT read that as "nothing foreign reaches these loops". This one has a
    // SECOND caller (`#layerChainDefaults`) handing it a raw bag from the caller
    // and from the matcher; the `UNSAFE_KEY` skip below is live because of it,
    // measured. `objectKeys` closes the own-ness question, not the provenance
    // one.
    for (const key of objectKeys(value)) {
      // ⚠ This skip was REMOVED once, on the claim that `value` always arrives
      // through `normalizeChannel` and the branch is therefore dead by
      // construction. The claim was false, and it was a REACHABILITY argument —
      // the kind this repository records as having been wrong repeatedly.
      //
      // The second caller is `RoutesNamespace.#layerChainDefaults`, which merges
      // a `forwardTo` hop's own defaults with the caller's bag AND with the
      // MATCHER's bag. Measured on a chain whose hop carries `defaultParams` /
      // `defaultSearch`: the merged record came back with `__proto__` among its
      // own keys on BOTH directions — including the URL one, where the value is
      // whatever the address bar said — and every `forwardState` interceptor
      // receives it. Coverage said "dead"; coverage was measuring the OTHER
      // caller.
      if (key === UNSAFE_KEY) {
        continue;
      }

      // ONE read, both decisions from it. Asking and then taking would be two
      // calls into the caller's accessor, and a bag that answers differently
      // between them lands `undefined` in a frozen channel — the same shape
      // `mergeWithDefault`'s copy loop names, on the defaulted path.
      const entry = value[key];

      // `undefined` means "I said nothing", so the default keeps the slot.
      if (entry === undefined) {
        continue;
      }

      putField(merged, key, entry);
    }
  }

  return merged as T;
}

/**
 * The own, string-keyed entries of a bag, in a fresh object — the copy
 * {@link stripUndefined} makes when it has something to strip.
 *
 * ⚑ Built key by key rather than spread, so it carries the same entries
 * `mergeWithDefault`'s own copy does (#1792). A spread also carries
 * symbol-keyed entries; that loop does not, and the two are the two exit paths
 * of one function — so with a spread here, whether a symbol survived a
 * navigation turned on whether some unrelated key happened to hold `undefined`.
 * Symbols are dropped, always: the rule `normalizeChannel` has applied to the
 * path channel since it was written, and the one the docs state for both.
 */
function copyOwnStringKeys(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};

  for (const key of objectKeys(value)) {
    // Dropped from the published channel, same rule as the entry guard (#1852).
    if (key === UNSAFE_KEY) {
      continue;
    }

    const entry = value[key];

    // ⚑ And `undefined` is dropped HERE, not only by the caller's delete
    // below (#1550 / #1551). This walk is a SECOND one, taken at the moment
    // of the first strip — so it enumerates a key a getter defined behind
    // `stripUndefined`'s walk, which will never come back to delete it.
    // Measured: without this, such a key reached a frozen `state.search`
    // through `router.navigate`, in `state.search` and not in `state.path`.
    if (entry !== undefined) {
      putField(copy, key, entry);
    }
  }

  return copy;
}

/**
 * Drops `undefined`-valued own keys, returning the input **unchanged** when there
 * are none (no allocation on the common path). `undefined` in ⇒ `undefined` out —
 * unlike {@link normalizeChannel}, which collapses an all-`undefined` bag to the
 * shared `EMPTY_PARAMS` singleton and is the path-channel entry guard.
 *
 * ⚑ It does NOT answer for `__proto__`, deliberately (#1792). It may hand its
 * input straight back, and its documented contract is that a caller who stores
 * or freezes the result must copy first — so the key is named at that copy, and
 * at every other one, rather than here. The copy this function does make, when
 * there IS something to strip, drops the key like every other copy in the file.
 */
function stripUndefined<T extends Record<string, unknown>>(
  value: T | undefined,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  let stripped: Record<string, unknown> | undefined;

  for (const key in value) {
    // `hasOwn` FIRST, and not only for the answer: reading `value[key]` on an
    // inherited name would fire an accessor this function has no business
    // touching. One question, asked once per key.
    if (!hasOwn(value, key) || value[key] !== undefined) {
      continue;
    }

    stripped ??= copyOwnStringKeys(value);

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
  return freeze(state);
}

/**
 * Merges a channel's route default UNDER a routed value (the value wins) and
 * freezes the result. Reuses the shared frozen `empty` singleton (EMPTY_PARAMS /
 * EMPTY_SEARCH, #1027) when there is neither a default nor a value — so the hot
 * path (no defaults, empty params) allocates zero objects. A defaulted channel
 * always builds a fresh frozen object key by key; an undefined-default channel
 * freezes a copy of the value (never the caller's object).
 *
 * `undefined` is absence on BOTH sides (`mergeDefined`, #1550 / #1551): an
 * explicitly-`undefined` caller value leaves the default in place, and a default
 * that carries `undefined` behaves like no entry — so the frozen state never
 * exposes an `undefined`-valued own key on either channel.
 *
 * `valueIsOwned` says the caller minted `value` itself and nothing else holds a
 * reference — then the defensive copy is skipped and the bag is frozen in place
 * (#1589). BOTH `canonicalize` channels may pass it since #1812 routed the query
 * bag through `normalizeChannel` too, so in the pipeline the value is always the
 * fresh object that normaliser just returned. The five call sites outside it —
 * `navigateToState` and `systemCommit`, which copy a `State` handed in through a
 * published API — may NOT: passing it there would freeze the caller's object,
 * commit it by reference, and skip the `__proto__` guard on the copy (#1792).
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
    return freeze(mergeDefined(defaultValue, value));
  }

  if (value === undefined || value === empty) {
    return empty;
  }

  // OWNED value: freeze in place. The copy below exists solely so the CALLER's
  // bag is never frozen out from under it — when the bag was minted one line
  // earlier by `normalizeChannel` (which always returns a fresh object or the
  // frozen `empty` singleton, never its input) there is no caller to protect,
  // and `undefined` values are already stripped, so `mergeDefined`'s walk is
  // redundant too. Measured on #1589: without this the path channel is copied
  // TWICE per producer call — once to normalize, once to freeze — on `navigate`,
  // `buildPath`, `matchPath`, `isActiveRoute` and `canNavigateTo` alike. Since
  // #1812 the QUERY channel is minted the same way, so both `canonicalize` calls
  // take this branch.
  //
  // ⚠ The branch below is NOT dead, and #1812's own reasoning for deleting it
  // ("both call sites mint it one line earlier") holds only against a tree where
  // `canonicalize` is the sole caller. It is not: `navigateToState` and
  // `systemCommit` hand over the CALLER's bags verbatim (#1792), five call sites
  // in all. Deleting it there would freeze a foreign object in place, commit it
  // by reference, and carry an own `__proto__` key into the published state —
  // the three things that branch exists to prevent.
  if (valueIsOwned) {
    return freeze(value);
  }

  // `mergeDefined` returns the argument itself when there is nothing to strip,
  // so copy before freezing — the caller's bag must never be frozen.
  const defined = mergeDefined(undefined, value);

  if (defined !== value) {
    return freeze(defined);
  }

  // ⚑ This copies a FOREIGN bag, so it names the key — with no reachability
  // argument (#1792). An earlier revision spread here instead, reasoning that
  // `stripUndefined` above forces a copy whenever the key is present, so
  // `defined === value` implied its absence. That inference assumes both steps
  // see the SAME key set, which is exactly what a bag the router does not own is
  // free to violate: a getter on a sibling key can define `__proto__` on its own
  // object mid-walk, after `stripUndefined` has passed that point and before the
  // copy runs. Measured — the key shipped into `state.search` through
  // `router.navigate`. A spread DEFINES, so it re-creates the key as a genuine
  // own property where plain assignment would merely have lost it.
  // ⚑ The `undefined` test is here for the SAME reason the key test is, and the
  // reason is worth stating because it is the one this block's own comment calls
  // unsound one paragraph up. Reaching this line means `stripUndefined` found
  // nothing to strip — but that is a fact about the walk it took, not about the
  // object, and a getter on a sibling key can DEFINE a new `undefined`-valued key
  // behind it. Measured: without this test such a key reaches a frozen
  // `state.search` through `router.navigate`, breaking "the frozen state never
  // exposes an `undefined`-valued own key" (#1550 / #1551). The value is already
  // being read on the next line, so asking costs a comparison.
  const copy: Record<string, unknown> = {};

  for (const key of objectKeys(value)) {
    // Dropped from the published channel, same rule as the entry guard (#1852).
    if (key === UNSAFE_KEY) {
      continue;
    }

    // ONE read, then both decisions from it — a second `value[key]` here would
    // be a second call into the caller's accessor, which `read-count-authority`
    // pins and which is the whole hazard this file is about.
    const entry = value[key];

    if (entry !== undefined) {
      putField(copy, key, entry);
    }
  }

  return freeze(copy);
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
export function normalizeChannel<T extends Record<string, unknown>>(
  bag: T,
  empty: Readonly<Record<string, never>>,
): T;

export function normalizeChannel(
  bag: undefined,
  empty: Readonly<Record<string, never>>,
): undefined;

export function normalizeChannel<T extends Record<string, unknown>>(
  bag: T | undefined,
  empty: Readonly<Record<string, never>>,
): T | undefined;

export function normalizeChannel<T extends Record<string, unknown>>(
  bag: T | undefined,
  empty: Readonly<Record<string, never>>,
): T | undefined {
  if (bag === undefined) {
    return bag;
  }

  let normalized: Record<string, unknown> | undefined;

  // ⚑ `Object.keys`, not `for…in` + `Object.hasOwn` (#1854). `hasOwn` is
  // `[[GetOwnProperty]]`, which on a Proxy is the `getOwnPropertyDescriptor`
  // TRAP — and the caller of `hasOwn` chooses the key, so the trap is asked
  // about one it is free to lie about. The Proxy invariants permit exactly that
  // while the target is extensible and the descriptor is `configurable`.
  // `Object.keys` asks `ownKeys` FIRST and consults descriptors only for keys
  // `ownKeys` already vouched for, so a key the target does not own is never put
  // to the trap.
  //
  // ⚠ Not a hypothetical bag: Svelte 5's `$props()` reports own-ness for a key
  // only its prototype has, on every `RouteView` render (#1853) — nobody wrote a
  // Proxy, the framework did. Measured through this door before the change: an
  // inherited `leaked` reached `state.params` while `state.path` printed without
  // it, i.e. a committed state contradicting its own URL.
  //
  // ⚠ The ambient half is NOT part of this, measured rather than assumed: an
  // enumerable `Object.prototype.x` was already filtered correctly here, because
  // `hasOwn` is honest about an object that does not lie. Only the trap shape
  // was ever admitted.
  //
  // Cost, same-session A/B, medians, noisy at the ±3 ns level: a wash on an
  // empty bag, ~8 ns cheaper at one key, ~equal at three. One read per key
  // either way.
  for (const key of objectKeys(bag)) {
    // ⚑ The key is DROPPED from the published channel, and that is a decision
    // SEPARATE from how the write is performed (#1852). `putField` below closes
    // the ambient-accessor class for every name — `id`, `tab`, `lang` — and this
    // skip closes a different one, on the far side of the contract: a bag core
    // hands BACK carrying an own `"__proto__"` is a prototype-swap primitive for
    // any consumer that merges it with `Object.assign` or a `for…in` copy.
    // Measured from a bare URL: `?__proto__` yields `null` and
    // `?__proto__=1&__proto__=2` an array, and the inherited setter accepts both.
    //
    // ⚑ Core's OWN precedent, not a fresh judgement. `getDependenciesApi.getAll()`
    // deletes this key for that reason in those words, and records the asymmetry:
    // a single read hands back a VALUE, a door like this hands back a CONTAINER
    // that someone will merge. `state.params` / `state.search` are the most-merged
    // containers the router publishes.
    //
    // ⚠ The data-preservation argument for carrying it does not survive contact
    // with a consumer either: `Object.assign` DROPS the key even in the safe
    // string case, so "the user's `?__proto__=1` is kept" held for exactly one
    // hop and then failed unpredictably rather than here.
    if (key === UNSAFE_KEY) {
      continue;
    }

    // ⚑ ONE read per key, and the result is built from it. A test-then-re-read
    // pair here would be a TOCTOU on an object the caller owns: the key is
    // ADMITTED on the first value and USED with the second. The query channel had
    // exactly that until #1812 — `stripUndefined` tested each key and
    // `mergeWithDefault` then spread the same bag to copy it — while the path
    // channel never did, because it has always gone through this loop.
    const value = bag[key];

    if (value !== undefined) {
      // Lazy allocation: an all-empty / all-undefined input costs zero objects.
      normalized ??= {};
      putField(normalized, key, value);
    }
  }

  // Reuse the caller's shared singleton when nothing survived so the merge's
  // `value === empty` reuse branch fires (#1027). The two channels have DISTINCT
  // singletons — `EMPTY_PARAMS` and `EMPTY_SEARCH` are separate frozen objects
  // compared by identity — which is why `empty` is a parameter, not a constant
  // read here.
  return (normalized as T | undefined) ?? (empty as unknown as T);
}

/**
 * Withholds `UNSAFE_KEY` from a bag core BUILT and is about to hand to
 * application code (#1904).
 *
 * `matchPath` parses the query out of the URL itself, and the parser creates
 * that own key deliberately (#855 / #1293) — writing it any other way would
 * swap the parsed object's own prototype. The published channels drop it much
 * further down, at `normalizeChannel`, which leaves two seams ABOVE the drop
 * holding a container core will not publish: a route's `decodeParams`, and
 * every `forwardState` interceptor on the URL direction.
 *
 * ⚑ The reason is the CONSUMER's merge, not core's own write. `putField` stores
 * the name perfectly well; what it cannot make safe is the next hop, where
 * `Object.assign` / a `for…in` copy / `dst[key] = value` reaches the inherited
 * setter and replaces that target's prototype instead of adding an entry —
 * silently, and from a bare URL (`?__proto__` parses to `null`,
 * `?__proto__=1&__proto__=2` to an array; a plain string value is inert). Same
 * rule, same words, as `getDependenciesApi.getAll`: a single read hands back a
 * VALUE, a door like this hands back a CONTAINER someone will merge.
 *
 * ⚠ NOT applied in the parser. Its `defineProperty` write must stay, or the
 * parse itself swaps a prototype — the drop belongs at the door, not at the
 * construction.
 *
 * Returns the input untouched, with no allocation, when the key is absent —
 * which is every ordinary URL, so the common path pays one `hasOwn`.
 */
export function withoutUnsafeKey<T extends Record<string, unknown>>(bag: T): T {
  if (!hasOwn(bag, UNSAFE_KEY)) {
    return bag;
  }

  const copy: Record<string, unknown> = {};

  for (const key of objectKeys(bag)) {
    if (key !== UNSAFE_KEY) {
      // `putField`, not a plain store: the remaining names also come straight
      // out of the URL, so the whole prototype chain is in play for them too.
      putField(copy, key, bag[key]);
    }
  }

  return copy as T;
}
