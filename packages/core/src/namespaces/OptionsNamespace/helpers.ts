// packages/core/src/namespaces/OptionsNamespace/helpers.ts

import type {
  DefaultDependencies,
  Options,
  Params,
  SearchParams,
} from "../../types";

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
 * Skipping accessors loses nothing: the object a getter RETURNS is not a slot
 * anyone can write through afterwards (the property itself is already sealed by
 * the `Object.freeze` above, which needs no read at all), and freezing a value
 * that may be freshly built on every call froze a different object each time.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    // Own-enumerable, exactly as `Object.values` enumerated — but the value is
    // taken off the DESCRIPTOR, so an accessor is never called.
    // `PropertyDescriptor["value"]` is `any`; an ACCESSOR descriptor has no
    // `value` at all, which is exactly the case that must contribute nothing.
    const value = Object.getOwnPropertyDescriptor(obj, key)?.value as unknown;

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
