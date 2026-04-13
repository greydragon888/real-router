import { ERROR_PREFIX } from "./constants";

import type { DataLoaderFactoryMap } from "./types";

export function validateLoaders(
  loaders: unknown,
): asserts loaders is DataLoaderFactoryMap {
  if (
    loaders === null ||
    typeof loaders !== "object" ||
    Array.isArray(loaders)
  ) {
    throw new TypeError(`${ERROR_PREFIX} loaders must be a non-null object`);
  }

  for (const [key, value] of Object.entries(
    loaders as Record<string, unknown>,
  )) {
    if (typeof value !== "function") {
      throw new TypeError(
        `${ERROR_PREFIX} loader for route "${key}" must be a function`,
      );
    }
  }
}
