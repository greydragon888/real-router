// packages/core/src/namespaces/OptionsNamespace/adoption.ts

import { defaultOptions } from "./constants";
import { copyOwnData } from "../../helpers";

import type { DefaultDependencies, Options } from "../../types";

/**
 * Captured at module load (#2073); `captured-intrinsics-authority-1971.test.ts`
 * owns the rule.
 */
const freeze = Object.freeze;

/** The bags a mutation could still be aimed at, weakly (#2148). */
export interface AdoptedOrigins {
  readonly defaultParams?: WeakRef<object>;
  readonly defaultSearch?: WeakRef<object>;
}

/**
 * Is this slot worth a weak note (#2148)?
 *
 * ⚠ Each test removes a watch that could never fire, and this is the only place
 * the rule is written:
 *
 * - a CALLBACK is not a container, so there is nothing for a mutation to detach;
 * - a FROZEN bag cannot move — which is what keeps a clone out, since
 *   `cloneRouter` constructs from the base's frozen copies, and which also admits
 *   a caller bag the application froze itself;
 * - core's own `defaultOptions` value is a process-wide singleton, and it reaches
 *   a clone's constructor through the RESOLVED options — so without this test a
 *   clone takes a reference to the shared `defaultSearch` literal, once per
 *   request under SSR.
 *
 * `options-ownership-1832` pins all three.
 */
function isWatchableBag(value: unknown): value is object {
  return (
    isBag(value) &&
    !Object.isFrozen(value) &&
    value !== defaultOptions.defaultParams &&
    value !== defaultOptions.defaultSearch
  );
}

/**
 * A weak note of where each adopted bag came from.
 *
 * ⚠ Reads `routerOptions`, which is CORE's object, so no application code runs
 * here — what it stores is the caller's bag held in that slot.
 * {@link isWatchableBag} decides which slots qualify.
 */
export function weakOrigins<Dependencies extends DefaultDependencies>(
  routerOptions: Omit<Partial<Options<Dependencies>>, "logger">,
): AdoptedOrigins {
  const { defaultParams, defaultSearch } = routerOptions;

  return freeze({
    ...(isWatchableBag(defaultParams) && {
      defaultParams: new WeakRef(defaultParams),
    }),
    ...(isWatchableBag(defaultSearch) && {
      defaultSearch: new WeakRef(defaultSearch),
    }),
  });
}

/**
 * Is this option slot a BAG rather than a callback or an absent value?
 *
 * ⚑ Takes `unknown` deliberately. Spelled inline, TypeScript narrows
 * `typeof x === "object"` against the declared union — which carries no `null` —
 * and `no-unnecessary-condition` then calls the null check redundant. It is not:
 * `typeof null === "object"`, `null` is what a config from `JSON.parse` or
 * `cfg.x ?? null` actually carries, and it must fall through to the validator
 * that names the option rather than reach `Object.keys` and raise a bare
 * `TypeError`. Same disagreement between the static type and the runtime that
 * `adoptForeignBag` spells out for its own `== null` guard.
 *
 * ⚠ The callback arm falls through here too, and must: a function is the
 * application's, stays the application's, and is called — not enumerated.
 */
function isBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Core-owned copies of the three `Options` sub-bags core HOLDS (#2171).
 *
 * ⚑ **The boundary is here, and it is one place for the three.** Before this,
 * core froze the level its own spread minted and stopped (#1832), so every
 * nested bag stayed the caller's object: held live, re-read on every
 * `navigateToDefault`, and handed back by identity through `getOptions()`.
 * #2145 retired the contracts that kept it that way; the measurements are
 * there.
 *
 * ⚠ **`queryParams` is deliberately NOT here, and that is a measured exception
 * rather than an omission.** Adopting it means handing back
 * `snapshotQueryParams`' copy, which carries the four DECLARED names only — so
 * a mis-spelled `arrayFromat` disappears from `getOptions().queryParams` and
 * `@real-router/validation-plugin` loses the unknown-option report it raises
 * for exactly that typo. Measured on this branch: the key set went from
 * `["arrayFormat", "arrayFromat", "extra"]` to `["arrayFormat"]`, with all 815
 * of that plugin's cells still green — an UNPINNED behaviour, which is why the
 * cost is recorded here as well as in `query-strategy-formats-1796.test.ts`.
 * What #2171 retired for that slot is its clone-time RE-READ instead:
 * `cloneRouter` inherits the base's resolved strategies, which is where the
 * #2032 defect actually lived.
 *
 * ⚠ **Each slot keeps the read semantics it already had.** `limits` is
 * own-enumerable, matching `createLimits`' spread and `snapshotLimitKeys`' key
 * snapshot — a copy that saw MORE than the spread would make the clone
 * stricter than its base, which is #1961's own divergence. `defaultParams` /
 * `defaultSearch` are own-enumerable too, the rule `packages/core/CLAUDE.md` ›
 * Supported Input Shapes already states for channel bags.
 *
 * ⚠ **Only what the caller PASSED.** `defaultOptions` supplies the absent slots
 * one frame later, inside `OptionsNamespace`, and those are core's own frozen
 * constants — copying them would allocate per router and own nothing new.
 *
 * ⚠ **A callback arm is not a bag.** `defaultParams` and `defaultSearch` each
 * accept a function, and a function is the application's, stays the
 * application's, and is called — not enumerated.
 *
 * ⚠ NOT a deep freeze. Deciding depth by asking each nested bag for its
 * `constructor` leaves an array inside a frozen bag writable, and moving that
 * array moves what the router navigates to. `options-ownership-1832.test.ts`
 * owns that shape list.
 */
export function adoptOptionBags<Dependencies extends DefaultDependencies>(
  routerOptions: Omit<Partial<Options<Dependencies>>, "logger">,
): Omit<Partial<Options<Dependencies>>, "logger"> {
  const adopted = { ...routerOptions };

  if (routerOptions.limits != null) {
    adopted.limits = copyOwnData("limits", routerOptions.limits);
  }

  if (isBag(routerOptions.defaultParams)) {
    adopted.defaultParams = copyOwnData(
      "defaultParams",
      routerOptions.defaultParams,
    );
  }

  if (isBag(routerOptions.defaultSearch)) {
    adopted.defaultSearch = copyOwnData(
      "defaultSearch",
      routerOptions.defaultSearch,
    );
  }

  return adopted;
}
