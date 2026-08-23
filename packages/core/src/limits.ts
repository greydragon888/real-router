// packages/core/src/limits.ts

import { DEFAULT_LIMITS } from "./constants";

import type { LimitsConfig } from "./types";
import type { Limits } from "./types/internal";

/**
 * Merges user limits with the defaults; returns a frozen-by-type value.
 *
 * Its own module rather than a corner of `helpers.ts`, where it sat until the
 * applicability audit: resource limits share nothing with that file's subject —
 * path/query channels, the default merge, value comparison, the state shape —
 * and a reader scanning `helpers.ts` for the channel model had to step over it.
 * The two places it could have gone instead both cost more than they save:
 * `types/limits.ts` is a TYPES module (and is re-exported into the public
 * `@real-router/core/types` entry, where runtime code has no business, least of
 * all under the two-phase dts build the augmentation invariant depends on), and
 * `constants.ts` exports no functions at all.
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
  // become `NaN`, which `size >= NaN` reads as "no cap" exactly as they did
  // before; `Infinity` stays `Infinity`; `null` becomes `0`, the documented
  // spelling of "no cap", where it previously made EVERY registration throw
  // `Listener limit (null) reached`. A `valueOf` that THROWS still throws — the
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
  return Object.freeze({
    maxDependencies: Number(raw.maxDependencies),
    maxPlugins: Number(raw.maxPlugins),
    maxListeners: Number(raw.maxListeners),
    warnListeners: Number(raw.warnListeners),
    maxLifecycleHandlers: Number(raw.maxLifecycleHandlers),
  });
}
