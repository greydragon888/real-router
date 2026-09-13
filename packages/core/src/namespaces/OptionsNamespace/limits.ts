// packages/core/src/namespaces/OptionsNamespace/limits.ts

import { DEFAULT_LIMITS } from "../../constants";

import type { LimitsConfig } from "../../types";
import type { Limits } from "../../types/internal";

/**
 * Captured at module load. `objectKeys` DECIDES which limits a clone inherits;
 * `freeze` BUILDS the guarantee that makes the limits and their key set safe to
 * hand out by reference (#2073). A no-op shim of either leaves the base and its
 * clones free to disagree.
 */
const objectKeys = Object.keys;
const freeze = Object.freeze;

/**
 * Merges user limits with the defaults; returns a frozen-by-type value.
 *
 * It sits with the rest of the options adoption: `adoptOptionBags` copies the
 * caller's `limits` bag, this resolves the copy's numbers, and
 * `snapshotLimitKeys` records the names the copy carries — readers that must
 * agree on the bag's own-enumerable surface.
 *
 * Not in `types/limits.ts`: that is a TYPES module, re-exported into the public
 * `@real-router/core/types` entry, where runtime code has no business — least
 * of all under the two-phase dts build the augmentation invariant depends on.
 *
 * @internal
 */
export function createLimits(userLimits: Partial<LimitsConfig> = {}): Limits {
  const merged = { ...DEFAULT_LIMITS, ...userLimits };

  // ⚑ Coerce here, once, and hand NUMBERS downstream (#1875). The spread above
  // already materialises an accessor on the bag, but it copies a VALUE by
  // reference — so a `{ valueOf() }` limit survived it and was re-coerced at
  // every use site. `EventEmitter` compares with `size >= maxListeners`, which
  // runs `ToPrimitive`, so that meant calling into application code once per
  // listener REGISTRATION, unboundedly, for the life of the router — and a
  // drifting `valueOf` silently moved the cap while it did.
  //
  // ⚠ Coercion only: a value that will not become a usable number is NOT
  // refused (owner decision, #1875). `undefined` and a non-numeric string both
  // become `NaN`, which `size >= NaN` reads as "no cap"; `Infinity` stays
  // `Infinity`; and `null` becomes `0`, the documented spelling of "no cap" —
  // not the refusal an unguarded `size >= null` would make of every
  // registration. A `valueOf` that THROWS still throws — the
  // caller's own error, now from the constructor instead of from an unrelated
  // `subscribe()`, which is the point of reading once.
  // ⚠ The five names are written out rather than looped over, and that is not
  // style: the repo's semgrep gate (`unguarded-computed-key-write`) blocks a
  // computed-key write inside a walk, and it blocks BOTH loop forms — over
  // `Object.keys(merged)` AND over a core-owned literal key tuple. Measured
  // against `.semgrep/rules.yml` itself, because the tuple is the form a reader
  // would reach for and its keys can never be `"__proto__"`; the gate does not
  // draw that distinction. Same shape `snapshotQueryParams` uses for
  // `queryParams`' four fields.
  //
  // ⚠ What catches a sixth limit added without reaching here is `tsc`, not a
  // mirror test: the return would miss a required field of
  // `Readonly<LimitsConfig>` and fail TS2741 (verified).
  // `type-mirror-authority.test.ts` does NOT cover `Limits` — its relation
  // table names none of them.
  // ⚠ Read through an `unknown` view, and the cast is load-bearing twice over.
  // Typed as declared, `Number(x)` is flagged a no-op by
  // `no-unnecessary-type-conversion` — correctly, for the DECLARED type, which
  // is precisely the type this distrusts; and a wrapper that widens it is
  // flagged by `prefer-native-coercion-functions`. Widening the SOURCE says the
  // same thing once, with no helper and no rule silenced.
  const raw = merged as Record<keyof LimitsConfig, unknown>;

  // ⚠ FROZEN — the docstring above has always promised it, but "frozen-by-type"
  // was true of the TYPE alone. This object is handed out BY REFERENCE in two
  // places: `getCloneState().limits`, which `cloneRouter` reads, and the
  // dependencies store. Without the freeze a consumer holding either could move
  // the cap a clone inherits while the base keeps the one its emitter was wired
  // with — measured, mutating the handed-out object left the base capped at 50
  // and the clone at 2, which is exactly the base/clone divergence #1880 exists
  // to prevent, reached through the slot #1880 added.
  return freeze({
    maxDependencies: Number(raw.maxDependencies),
    maxPlugins: Number(raw.maxPlugins),
    maxListeners: Number(raw.maxListeners),
    warnListeners: Number(raw.warnListeners),
    maxLifecycleHandlers: Number(raw.maxLifecycleHandlers),
  });
}

/**
 * Which limits the caller NAMED, snapshotted beside the values (#1961).
 * `createLimits` owns what each limit IS; this owns which ones the caller set,
 * and a clone needs both. Read once, at construction, for the same reason the
 * values are: the caller's bag stays theirs.
 *
 * ⚠ `objectKeys`, matching `createLimits`' SPREAD, not `Object.hasOwn` over
 * the five known names. The spread skips a non-enumerable own key, so the
 * base does not see one — and a snapshot that did would make the clone
 * stricter than its base. Pinned by "a non-enumerable own limit is invisible
 * to the base AND to the clone".
 *
 * ⚠ FROZEN, for the reason the limits themselves are (#1880): `getCloneState`
 * hands this out BY REFERENCE, so a consumer holding it could move what the
 * clone inherits while the base kept what its emitter was wired with —
 * measured on the unfrozen form, emptying it gave the base cap 50 and the
 * clone none, and pushing a name onto it made the clone report a
 * materialised default the base never had. That is #1961's own divergence,
 * reintroduced through the slot that fixes it.
 */
export function snapshotLimitKeys(
  limits: Partial<LimitsConfig> | undefined,
): readonly string[] | undefined {
  return limits == null ? undefined : freeze(objectKeys(limits));
}
