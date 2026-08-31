// packages/core/src/helpers.ts

import {
  EMPTY_OPTS,
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  UNSAFE_KEY,
} from "./constants";
import { putField } from "./utils/ingest";

import type { NavigationOptions, State } from "./types";

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
/**
 * The one `NavigationOptions` key core's entry door withholds from its copy
 * (#1962). Typed as `keyof NavigationOptions` rather than written as a bare
 * literal, so renaming the field is a compile error here instead of a silently
 * preserved `signal` — the spelling is not the thing being named, the FIELD is.
 */
const SIGNAL_KEY: keyof NavigationOptions = "signal";
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
      // {@link adoptForeignBag}'s copy loop names, on the defaulted path.
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
 * {@link adoptForeignBag}'s own copy does (#1792). A spread also carries
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

/**
 * Shallow key/value equality of two param-like records (path params or query),
 * using {@link areParamValuesEqual} per key so array values compare by content.
 *
 * Both readers need the SAME comparison and it is built on the function above,
 * so it lives beside it: `StateNamespace.areStatesEqual` uses it for state
 * IDENTITY (both channels, whole bags — #515 / #478), and `isActiveRoute`'s
 * exact arm for the query half of a LOCATION (#1978).
 */
export function recordsShallowEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = objectKeys(left);

  if (leftKeys.length !== objectKeys(right).length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!(key in right) || !areParamValuesEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
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
 * - `params` — {@link materialize} at the publication boundary, and nowhere else
 *   no merge to freeze it, so `pipeline/materialize` does at the publication
 *   boundary (#1598), for the frozen and the pending producer alike
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
 * The shared half of the two channel merges: a route default UNDER a value the
 * PIPELINE minted, with the channel's own `empty` singleton (#1027) reused when
 * neither side has anything — so the hot path allocates zero objects.
 *
 * `undefined` is absence on BOTH sides (`mergeDefined`, #1550 / #1551): an
 * explicitly-`undefined` caller value leaves the default in place, and a default
 * carrying `undefined` behaves like no entry.
 *
 * ⚑ It does NOT freeze and it does NOT copy, and both follow from the ONE thing
 * its callers have in common: `value` is the object `normalizeChannel` returned
 * one line earlier, so nothing outside holds a reference to protect and each
 * channel's own publication rule decides the freeze. A bag that came from
 * somewhere else must go through {@link adoptForeignBag} instead — this was one
 * function with a `valueIsOwned` switch until the two halves were found to share
 * no caller: five of the seven call sites never passed a default either, so the
 * switch was naming a split the parameters already had.
 */
function mergeOwnChannel(
  defaultValue: Record<string, unknown> | undefined,
  value: Record<string, unknown> | undefined,
  empty: Readonly<Record<string, never>>,
): Readonly<Record<string, unknown>> {
  if (defaultValue !== undefined) {
    return mergeDefined(defaultValue, value);
  }

  if (value === undefined || value === empty) {
    return empty;
  }

  return value;
}

/**
 * Stage ③ for the PATH channel — and it hands the bag back UNFROZEN.
 *
 * `materialize` owns this freeze, at the publication boundary and nowhere else
 * (#1598 moved it there, #1928 removed the second owner). Freezing here as well
 * certified nothing a consumer can observe — every `Canonical` that becomes a
 * State is frozen by `materialize`, and the ones that do not become a State are
 * discarded — while producing a split that WAS observable: `buildURL` hands this
 * bag to the interceptable `buildPath`, so a plugin saw a live object on a route
 * with no defaults and a frozen one on every other route.
 *
 * @internal
 */
export function mergePathChannel(
  defaultParams: Record<string, unknown> | undefined,
  bag: Record<string, unknown> | undefined,
): Readonly<Record<string, unknown>> {
  return mergeOwnChannel(defaultParams, bag, EMPTY_PARAMS);
}

/**
 * Stage ③ for the QUERY channel — and this one DOES freeze, which is the
 * asymmetry with {@link mergePathChannel}.
 *
 * ⚠ **The asymmetry is PERF-GATED, and nothing but that gate holds it.** An
 * earlier revision of this docblock argued correctness — that `admittedSearch`'s
 * no-drop branch hands the bag on untouched, so `state.search` "would reach the
 * caller unfrozen without this". Measured: it would not. With this freeze
 * removed and `freeze(state.search)` added to `materialize` beside `params`, the
 * whole suite is GREEN — 4761 tests, zero failures. `materialize` is below every
 * hop that could publish, so the publication guarantee survives the move.
 *
 * What the move costs is now MEASURED on this shape, and the cited figure was
 * pointing at the wrong arm. Alternating A/B processes, 9 pairs, medians, with
 * an A/A control interleaved (`isActiveRoute-sibling` early-outs above
 * `canonicalize` and must not move — it did not, −0.5 % against a ±0.7 % floor):
 *
 *     arm                     merge (now)  materialize   delta    A/A floor
 *     isActiveRoute-exact         215.8       219.3      +1.6 %     ±1.6 %   noise
 *     isActiveRoute-parent        131.5       139.9      +6.3 %     ±0.9 %   REGRESSION
 *     buildPath-params            460.8       444.0      −3.6 %     ±0.8 %   gain
 *     canNavigateTo               781.2       783.4      +0.3 %     ±0.4 %   noise
 *
 * ⚠ #1598 named `isActiveRoute-exact` at 9.8 %. On this shape that arm is inside
 * the noise floor and the cost has MOVED to `parent` at 6.3 % — which is why the
 * figure had to be re-taken rather than cited: it was measured when the merge
 * froze BOTH channels, and #1928 ended that.
 *
 * The mechanism is the short-circuit below. On `parent` the query bag IS the
 * `EMPTY_SEARCH` singleton, so this function returns it untouched while
 * `materialize` would re-freeze it — the ~8 ns #1598 identified, landing on a
 * different arm than it recorded. `buildPath` never materialises, so under the
 * move it stops paying any freeze at all: that is the −3.6 %, and it is real but
 * does not buy back a render-path predicate.
 *
 * So the split stands, on a measurement rather than on a citation. Numbers are
 * tsx-against-`src`, i.e. comparable to each other, not to a `dist` absolute.
 *
 * @internal
 */
export function mergeQueryChannel(
  defaultSearch: Record<string, unknown> | undefined,
  bag: Record<string, unknown> | undefined,
): Readonly<Record<string, unknown>> {
  const merged = mergeOwnChannel(defaultSearch, bag, EMPTY_SEARCH);

  // The singleton is frozen by construction, and re-freezing costs the same
  // ~8 ns the paragraph above is about.
  //
  // ⚑ EQUIVALENT under mutation, and declared rather than left as a silent
  // survivor: replacing this with a plain `freeze(merged)` reds NOTHING (4761
  // tests, measured). It cannot — re-freezing an already-frozen object is a
  // no-op observationally, so only a benchmark can tell the two apart. And one
  // did: this branch is exactly what makes `isActiveRoute-parent` 6.3 % cheaper
  // here than at the publication boundary, because on that arm the bag IS the
  // singleton. Behaviourally equivalent, NOT perf-equivalent — do not
  // "simplify" it back on the strength of a green suite.
  return merged === EMPTY_SEARCH ? merged : freeze(merged);
}

/**
 * Adopts a bag the router does NOT own: strips `undefined`-valued keys, drops
 * `UNSAFE_KEY`, copies, and freezes the copy.
 *
 * The five call sites are `navigateToState` and `systemCommit`, which copy a
 * `State` handed in through a published API (#1792). None of them merges a
 * default — that is the other half of the split described on
 * {@link mergeOwnChannel} — so there is no `defaultValue` parameter to pass
 * `undefined` to five times over.
 *
 * ⚠ Every step here exists because the object is foreign: freezing in place
 * would freeze the caller's own bag, committing it by reference would let the
 * caller mutate a published state, and skipping the key drop would carry an own
 * `__proto__` into it.
 *
 * @internal
 */
export function adoptForeignBag(
  value: Record<string, unknown> | undefined,
  empty: Readonly<Record<string, never>>,
): Readonly<Record<string, unknown>> {
  if (value === undefined || value === empty) {
    return empty;
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

/**
 * Core's own copy of the caller's `NavigationOptions`, made once at the entry
 * door (#1962) — every own enumerable key, minus `signal`, into a frozen record.
 *
 * ⚑ **Every own enumerable key, not the declared ones** — owner decision,
 * 2026-08-30, recorded in `CLAUDE.md` "Supported Input Shapes". Curating to "the
 * declared fields" is not expensive, it is INEXPRESSIBLE: `NavigationOptions` is
 * extended by module augmentation (`hash` / `hashChange` / `source`, three URL
 * plugins), and augmentation leaves nothing in the emitted JS to normalise
 * against — a curating copy could only hold a list hard-coded when it was
 * written, going stale against the contract in silence.
 *
 * ⚑ `signal` is the one key dropped, and dropping it HERE is what removes the
 * defect rather than moving it. The announcement used to strip it (`stripSignal`)
 * only because it is non-serialisable — so whether a plugin received the app's
 * own object or a copy turned on whether the app happened to pass a signal, a
 * discriminator the plugin never sees. Core reads the signal once at the entry
 * and carries it as `NavigationContext.externalSignal`, which is the only form
 * the machine may ask about (#1690 / #1717); nothing downstream reads
 * `opts.signal`, so the key has no reader left to lose.
 *
 * ⚠ `UNSAFE_KEY` goes too, and that is the HAND-OUT rule acting on this object
 * rather than a second decision: this copy IS what every plugin hook receives,
 * so an own `"__proto__"` on it is a prototype-swap primitive for anything that
 * merges it with `Object.assign` (#1957). Entry and hand-out coincide here, so
 * the drop happens once.
 *
 * ⚠ It reads each key EXACTLY once — the rule `opts-read-once-1817` pins for the
 * named flags, extended by this copy to keys core never names. Every read below
 * the door is then a read of core's own data, so the six hoisted flags cost the
 * caller's accessors nothing at all.
 *
 * ⚠ **A key loop, and the cheaper spread is REFUTED rather than merely
 * disliked.** `{ signal: _, ...rest }` measured 27 ns against this loop's 120
 * on the four-key bag a URL plugin actually sends — and it READS `opts.signal`
 * to exclude it, which is a second call into the caller's accessor. That is
 * exactly what `commit-gate-reads-the-snapshot-1717` counts: it caught the
 * substitution at `readsAtAnnounce` 2 instead of 1. Any spread reads every key,
 * so skipping one WITHOUT reading it is what forces the loop.
 *
 * ⚑ `putField` inside it, then, for the ordinary reason (#1852): the key is the
 * caller's, the target has `Object.prototype` on its chain, and a plain
 * `[[Set]]` under a name like `toString` is divertible by an ambient accessor.
 *
 * ⚠ **Not folded into {@link copyOwnStringKeys}, which it nearly repeats.** The
 * two differ on `undefined`: that loop drops an `undefined`-valued key because a
 * frozen `state.search` may never expose one (#1550 / #1551), and this one keeps
 * it because `{ replace: undefined }` is what the caller wrote and what every
 * arc handed to a hook before. Folding them needs a skip-set or a flag — the
 * selector parameter this file's own split (`mergePathChannel` /
 * `mergeQueryChannel` / `adoptForeignBag`) was made to remove. Three named
 * copies with different rules, not one with switches.
 *
 * @internal
 */
export function adoptNavigationOptions(
  opts: NavigationOptions,
): Readonly<NavigationOptions> {
  // `navigate("b")` is the commonest call there is, and the facade substitutes
  // this exact singleton for it — already core's own, already frozen, already
  // empty. Recognising it by identity is the difference between one comparison
  // and a copy plus a freeze (~57 ns measured) on the majority of navigations.
  if (opts === EMPTY_OPTS) {
    return EMPTY_OPTS;
  }

  const copy: Record<string, unknown> = {};
  const bag = opts as Record<string, unknown>;

  for (const key of objectKeys(bag)) {
    // `signal` is skipped WITHOUT being read — core already holds the entry
    // snapshot, and reading it again here is the very thing #1717 pins.
    if (key === UNSAFE_KEY || key === SIGNAL_KEY) {
      continue;
    }

    putField(copy, key, bag[key]);
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
 * `value === empty` reuse branch (the channel merges) fires and an empty-params
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
    // the merge then spread the same bag to copy it — while the path
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
/**
 * Remove `UNSAFE_KEY` from an object core JUST allocated for a hand-out (#1957).
 *
 * The sibling of {@link withoutUnsafeKey}, and the split between them is which
 * of the two questions the call site has already answered:
 *
 *   - {@link withoutUnsafeKey} is handed a bag it does NOT own, so it gates on
 *     `hasOwn` and copies only when it must. That gate is the price of not
 *     allocating on a path where the key is almost always absent.
 *   - this one is handed the RESULT of a spread core just performed, so there
 *     is nothing to copy and nothing to preserve — and the delete is therefore
 *     UNCONDITIONAL. `getAll` recorded why (#1823) and the reason generalises:
 *     guarding it with `hasOwn` decides nothing (deleting an absent key is a
 *     no-op in every observable respect, measured) while putting a re-pointable
 *     intrinsic read in front of the one line that neutralises the hazard.
 *     Capturing `hasOwn` at module load does not close that either — a shim
 *     evaluated BEFORE this module, the ordinary polyfill order, still wins.
 *
 * ⚠ Only ever call this on an object core allocated in the same expression. It
 * MUTATES, and a caller's own bag is not core's to edit.
 *
 * ⚠ That precondition is the CONTRACT and the type cannot express it, so here
 * is what breaking it costs, measured: `delete` on a FROZEN container carrying
 * the key, or on a non-configurable own key, throws
 * `TypeError: Cannot delete property '__proto__'` — every module is strict. An
 * absent key is a no-op even under a freeze, which is why no shipped site can
 * reach the throw by accident (all four hand over a spread made one expression
 * earlier). The throw is the right failure mode rather than a flaw: a silent
 * no-op would leave the key on a published container with nobody the wiser.
 * Not pinned by a test — no public door can hand this a frozen bag, and a
 * functional test may not reach `src` to try.
 *
 * ⚠ The three sites it serves all SPREAD rather than copy key by key, and that
 * is load-bearing (#1852): a spread `[[Define]]`s, while `dst[key] = value`
 * dispatches into whatever `Object.prototype` carries under an ordinary
 * dependency or option name. The first draft of #1823's fix used the loop and
 * turned an already-immune door into a member of that class.
 */
export function dropUnsafeKey<T extends object>(fresh: T): T {
  delete (fresh as Record<string, unknown>)[UNSAFE_KEY];

  return fresh;
}

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
