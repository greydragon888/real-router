// packages/core/src/namespaces/OptionsNamespace/helpers.ts

import type {
  DefaultDependencies,
  Options,
  Params,
  SearchParams,
} from "../../types";

/**
 * Intrinsics captured at module load: `getOwnPropertyDescriptor`, `getOwnPropertyNames`, `freeze`.
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
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getOwnPropertyNames = Object.getOwnPropertyNames;
const freeze = Object.freeze;

/**
 * Recursively freezes an object and all nested objects.
 * Only freezes plain objects, not primitives or special objects.
 *
 * ⚡ The walk reads DESCRIPTORS, never values, and that is a correctness fix
 * rather than a style choice. `Object.values` INVOKES every own-enumerable
 * getter it passes, and the caller's `queryParams` bag is accessor-backed by
 * contract — so the freeze, whose whole job is to stop writes, was calling
 * application code, and calling it a SECOND time after `snapshotQueryParams`
 * had already read the same fields. Measured with `countingBag`: two reads per
 * construction, one from here and one from the snapshot. A getter that
 * re-enters `createRouter` therefore branched twice per level instead of once
 * — 2ⁿ instead of n — and a modest nesting depth stopped terminating.
 *
 * ⚠ Skipping accessors loses something at depth >= 2 — and only there, which a
 * previous version of this sentence overstated in the other direction after an
 * earlier one understated it. Measured: a TOP-LEVEL getter's value is still
 * deep-frozen, because `OptionsNamespace` spreads the caller's bag first and the
 * spread materialises the getter into a data property before this walk sees it.
 * A getter one level down is not reached, so a nested plain object behind it
 * is no longer frozen, so a caller can
 * write into it afterwards and `getOptions()` reports the write. The two goals
 * are in direct conflict and cannot both be had — the value behind a getter is
 * only reachable BY INVOKING the getter, which is the caller's code, which is
 * precisely what this walk exists to stop running.
 *
 * The trade is taken deliberately, in this direction, on two grounds: a value
 * that may be freshly built on every call froze a different object each time,
 * so the freeze was already illusory for that shape; and the slot itself is
 * sealed by the `Object.freeze` above, which needs no read at all, so what is
 * lost is depth and never the property. Whether core should be freezing the
 * caller's objects at all is the larger question, tracked separately.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  freeze(obj);

  for (const key of getOwnPropertyNames(obj)) {
    // ⚑ ONE descriptor read per key, and `getOwnPropertyNames` rather than
    // `Object.keys`, which is the whole point rather than a style choice.
    // `Object.keys` must already ask the object for EVERY descriptor just to
    // filter by `enumerable`; asking a second time for the value therefore
    // DOUBLED the question on a Proxy-backed bag, where `[[GetOwnProperty]]` is
    // the CALLER's trap — application code, exactly like the getter this walk
    // stopped invoking. Measured on a 1-key Proxy: three `getOwnPropertyDescriptor`
    // traps per construction, one of them purely this line's. The enumerability
    // filter is applied below, to the descriptor already in hand.
    const descriptor = getOwnPropertyDescriptor(obj, key);

    if (!descriptor?.enumerable) {
      continue;
    }

    // `PropertyDescriptor["value"]` is `any`; an ACCESSOR descriptor has no
    // `value` at all, which is exactly the case that must contribute nothing.
    const value = descriptor.value as unknown;

    if (value && typeof value === "object" && value.constructor === Object) {
      deepFreeze(value);
    }
  }

  return obj;
}

/**
 * Resolves an option value that can be static or a callback.
 * If the value is a function, calls it with getDependency and returns the result.
 * Otherwise, returns the value as-is.
 */
export function resolveOption<D extends DefaultDependencies>(
  value: Options<D>["defaultRoute"],
  getDependency: (name: string) => unknown,
): string;

export function resolveOption<D extends DefaultDependencies>(
  value: Options<D>["defaultParams"],
  getDependency: (name: string) => unknown,
): Params;

export function resolveOption<D extends DefaultDependencies>(
  value: Options<D>["defaultSearch"],
  getDependency: (name: string) => unknown,
): SearchParams;

export function resolveOption<D extends DefaultDependencies>(
  value:
    | Options<D>["defaultRoute"]
    | Options<D>["defaultParams"]
    | Options<D>["defaultSearch"],
  getDependency: (name: string) => unknown,
): string | Params | SearchParams {
  if (typeof value === "function") {
    // Runtime getDependency is (name: string) => unknown, but DefaultRouteCallback<object>
    // expects <K extends keyof object>(name: K) => object[K] where keyof object = never.
    // Cast needed to bridge generic constraint mismatch.
    return value(getDependency as never);
  }

  return value;
}
