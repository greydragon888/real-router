import { DEFAULT_LIMITS } from "../../constants";

import type { DefaultDependencies } from "../../types";
import type { Limits } from "../../types/internal";

/**
 * Captured at module load. A guard is only as strong as the intrinsic it reads
 * WHEN IT RUNS, and an application can re-point `Object.keys` after boot —
 * the doctrine `guards`, `SegmentMatcher` and `helpers` already follow. ⚠ It
 * does not close a shim evaluated BEFORE this module; the window it closes is
 * "after boot".
 */
const objectKeys = Object.keys;

export interface DependenciesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  dependencies: Partial<Dependencies>;
  limits: Limits;
}

export function createDependenciesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  initialDependencies: Partial<Dependencies> = {},
): DependenciesStore<Dependencies> {
  const dependencies = Object.create(null) as Partial<Dependencies>;

  // ⚑ `Object.keys`, and read ONCE (#1816 / #1823 / #1799).
  //
  // The walk is THE SAME ONE `guardDependencies` uses, and that is the point:
  // an intermediate draft walked `for…in` and filtered with `Object.hasOwn`,
  // which enumerates the same set for a plain object but NOT for a Proxy —
  // `for…in` asks `ownKeys` plus the chain, `hasOwn` asks the
  // `getOwnPropertyDescriptor` trap, and a bag that answers those two
  // differently gets a key past the copy loop that the guard never judged.
  // Measured: a forbidden getter reached the store and ran. Walking `ownKeys`
  // once leaves nothing for the two halves to disagree about. It is also
  // faster — measured −18 % at one key and −25 % at twenty.
  //
  // Read ONCE: the loop used to read each key twice — the `!== undefined` test
  // and the value stored — so a key was ADMITTED on one value and STORED with
  // another. Neither needs inheritance to fire: a Proxy is enough.
  // `objectKeys` yields `string`, where `for…in` narrowed to the key union — so
  // both sides are widened once here rather than casting at each index.
  const source = initialDependencies as Record<string, unknown>;
  const target = dependencies as Record<string, unknown>;

  for (const key of objectKeys(source)) {
    const value = source[key];

    if (value !== undefined) {
      // ⚑ The destination is the dependency store, built with `Object.create(null)`
      // (`dependenciesStore`), so there is no inherited setter for `"__proto__"` to
      // dispatch into: the key lands as an ordinary own property. That is the
      // exemption the SAST rule's own message names, and it is load-bearing rather
      // than incidental — `set("__proto__", v)` is a supported call whose value
      // `has`/`get` return, and `getAll()` is the door that withholds it on the way
      // out (#1823).
      // nosemgrep: unguarded-computed-key-write
      target[key] = value;
    }
  }

  return {
    dependencies,
    limits: DEFAULT_LIMITS,
  };
}
