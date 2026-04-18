import type { ActiveRouteSourceOptions } from "./types.js";

/**
 * Default options for `createActiveRouteSource` and adapter-level helpers.
 *
 * Frozen to prevent accidental mutation by consumers.
 */
export const DEFAULT_ACTIVE_OPTIONS: Readonly<
  Required<ActiveRouteSourceOptions>
> = Object.freeze({
  strict: false,
  ignoreQueryParams: true,
});

/**
 * Normalizes partial `ActiveRouteSourceOptions` into a fully-defaulted object.
 *
 * Use this to produce a stable options record for comparison, caching, or
 * downstream consumers that require all fields present.
 */
export function normalizeActiveOptions(
  options?: ActiveRouteSourceOptions,
): Required<ActiveRouteSourceOptions> {
  return {
    strict: options?.strict ?? DEFAULT_ACTIVE_OPTIONS.strict,
    ignoreQueryParams:
      options?.ignoreQueryParams ?? DEFAULT_ACTIVE_OPTIONS.ignoreQueryParams,
  };
}
