// packages/core/src/namespaces/OptionsNamespace/helpers.ts

import type {
  DefaultDependencies,
  Options,
  Params,
  SearchParams,
} from "../../types";

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
