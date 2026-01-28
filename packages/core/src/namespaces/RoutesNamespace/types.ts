// packages/core/src/namespaces/RoutesNamespace/types.ts

import type { Params } from "@real-router/types";

/**
 * Configuration storage for routes.
 * Stores decoders, encoders, default params, and forward mappings.
 */
export interface RouteConfig {
  /** Custom param decoders per route */
  decoders: Record<string, (params: Params) => Params>;

  /** Custom param encoders per route */
  encoders: Record<string, (params: Params) => Params>;

  /** Default params per route */
  defaultParams: Record<string, Params>;

  /** Forward mappings (source -> target) */
  forwardMap: Record<string, string>;
}
