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
  return { ...DEFAULT_LIMITS, ...userLimits };
}
