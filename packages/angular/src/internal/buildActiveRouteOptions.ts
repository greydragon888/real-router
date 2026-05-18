import type { ActiveRouteSourceOptions } from "@real-router/sources";

/**
 * Build the `options` literal for `createActiveRouteSource` while honoring
 * `exactOptionalPropertyTypes` — the type forbids passing `{ hash: undefined }`
 * literally (#532), so callers must conditionally include the `hash` key only
 * when a value was provided.
 *
 * Used by `RealLink`, `RealLinkActive`, and `injectIsActiveRoute` — extracted
 * from three identical ternaries (review-2026-05-16 §8a LOW).
 */
export function buildActiveRouteOptions(
  strict: boolean,
  ignoreQueryParams: boolean,
  hash: string | undefined,
): ActiveRouteSourceOptions {
  return hash === undefined
    ? { strict, ignoreQueryParams }
    : { strict, ignoreQueryParams, hash };
}
