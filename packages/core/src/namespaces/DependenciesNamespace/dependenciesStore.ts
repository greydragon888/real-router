import { DEFAULT_LIMITS } from "../../constants";
import { ingestDependencies } from "../../guards";

import type { DefaultDependencies } from "../../types";
import type { Limits } from "../../types/internal";

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
  // The walk is THE SAME ONE the judge uses — literally the same loop since
  // #1861, not merely the same spelling — and that is the point:
  // an intermediate draft walked `for…in` and filtered with `Object.hasOwn`,
  // which enumerates the same set for a plain object but NOT for a Proxy —
  // `for…in` asks `ownKeys` plus the chain, `hasOwn` asks the
  // `getOwnPropertyDescriptor` trap, and a bag that answers those two
  // differently gets a key past the copy loop that the guard never judged.
  // Measured: a forbidden getter reached the store and ran. Walking `ownKeys`
  // once leaves nothing for the two halves to disagree about. It is also
  // faster — measured −18 % at one key and −25 % at twenty.
  //
  // Read ONCE: reading each key twice — the `!== undefined` test and the value
  // stored — admits a key on one value and STORES another. Neither shape needs
  // inheritance to fire: a Proxy is enough.
  //
  // ⚑ The walk itself now lives in `ingestDependencies` (#1860 / #1861), which
  // is the ONE door all three dependency-bag entry points share — and it judges
  // and copies in a SINGLE pass, so this is also the only enumeration of the
  // caller's bag a router construction performs. Two walks — the constructor's
  // guard, then this loop — let a `Proxy` whose `ownKeys` answers differently
  // between them install a key nobody judged.
  const source = initialDependencies as Record<string, unknown>;
  const target = dependencies as Record<string, unknown>;

  ingestDependencies(source, (key, value) => {
    // ⚑ The destination is the dependency store, built with `Object.create(null)`
    // (`dependenciesStore`), so there is no inherited setter for `"__proto__"` to
    // dispatch into: the key lands as an ordinary own property. That is the
    // exemption the SAST rule's own message names, and it is load-bearing rather
    // than incidental — `set("__proto__", v)` is a supported call whose value
    // `has`/`get` return, and `getAll()` is the door that withholds it on the way
    // out (#1823).
    // nosemgrep: unguarded-computed-key-write
    target[key] = value;
  });

  return {
    dependencies,
    limits: DEFAULT_LIMITS,
  };
}
