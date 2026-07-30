import type {
  DefaultDependencies,
  Params,
  SearchParams,
} from "@real-router/core";
import type { Router } from "@real-router/core/types";

export interface PreloadPluginOptions {
  /** Hover debounce delay in ms. @default 65 */
  delay?: number;
  /** Check saveData/2g and disable preloading on slow connections. @default true */
  networkAware?: boolean;
}

/**
 * Destination channels handed to a preload function (RFC-4 M2 / #1548): `params`
 * is the path channel, `search` the query channel — the single-dictionary shape
 * shared across all user callbacks.
 */
export interface PreloadTarget {
  params: Params;
  search: SearchParams;
}

/**
 * Preload function called when navigation intent is detected (hover, touch).
 * Fire-and-forget: return values and errors are discarded.
 */
export type PreloadFn = (target: PreloadTarget) => Promise<unknown>;

/**
 * Factory function for creating preload hooks.
 * Receives the router instance and a dependency getter (same pattern as GuardFnFactory).
 * Factory runs once at first invocation; the returned function is cached per route.
 */
export type PreloadFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => PreloadFn;
