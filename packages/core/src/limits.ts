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
  // style: `merged` is caller-derived, so a computed-key write (`out[key] = …`)
  // is the `__proto__` class the repo's semgrep gate blocks — an own
  // `"__proto__"` key would swap the destination's prototype instead of being
  // stored. Same shape `snapshotQueryParams` uses for `queryParams`' four
  // fields, and bound to the type by `type-mirror-authority.test.ts`, which
  // fails if a sixth limit is added without reaching here.
  // ⚠ Read through an `unknown` view, and the cast is load-bearing twice over.
  // Typed as declared, `Number(x)` is flagged a no-op by
  // `no-unnecessary-type-conversion` — correctly, for the DECLARED type, which
  // is precisely the type this distrusts; and a wrapper that widens it is
  // flagged by `prefer-native-coercion-functions`. Widening the SOURCE says the
  // same thing once, with no helper and no rule silenced.
  const raw = merged as Record<keyof LimitsConfig, unknown>;

  return {
    maxDependencies: Number(raw.maxDependencies),
    maxPlugins: Number(raw.maxPlugins),
    maxListeners: Number(raw.maxListeners),
    warnListeners: Number(raw.warnListeners),
    maxLifecycleHandlers: Number(raw.maxLifecycleHandlers),
  };
}
