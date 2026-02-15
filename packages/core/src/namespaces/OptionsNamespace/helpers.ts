// packages/core/src/namespaces/OptionsNamespace/helpers.ts

import type { Options, Params } from "@real-router/types";

/**
 * Recursively freezes an object and all nested objects.
 * Only freezes plain objects, not primitives or special objects.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];

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
export function resolveOption(
  value: Options["defaultRoute"],
  getDependency: (name: string) => unknown,
): string;

export function resolveOption(
  value: Options["defaultParams"],
  getDependency: (name: string) => unknown,
): Params;

// eslint-disable-next-line sonarjs/function-return-type -- overloads: string for defaultRoute, Params for defaultParams
export function resolveOption(
  value: Options["defaultRoute"] | Options["defaultParams"],
  getDependency: (name: string) => unknown,
): string | Params {
  if (typeof value === "function") {
    // Runtime getDependency is (name: string) => unknown, but DefaultRouteCallback<object>
    // expects <K extends keyof object>(name: K) => object[K] where keyof object = never.
    // Cast needed to bridge generic constraint mismatch.
    return value(getDependency as never);
  }

  return value;
}
