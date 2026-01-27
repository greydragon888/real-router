// packages/core/src/namespaces/RoutesNamespace/helpers.ts

import type { RouteConfig } from "./types";
import type { Params } from "@real-router/types";

/**
 * Creates an empty RouteConfig.
 */
export function createEmptyConfig(): RouteConfig {
  return {
    decoders: Object.create(null) as Record<string, (params: Params) => Params>,
    encoders: Object.create(null) as Record<string, (params: Params) => Params>,
    defaultParams: Object.create(null) as Record<string, Params>,
    forwardMap: Object.create(null) as Record<string, string>,
  };
}
