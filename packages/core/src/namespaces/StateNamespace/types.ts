// packages/core/src/namespaces/StateNamespace/types.ts

import type { Params } from "@real-router/types";

/**
 * Dependencies injected from Router for state creation.
 */
export interface StateNamespaceDependencies {
  /** Get defaultParams config for a route */
  getDefaultParams: () => Record<string, Params>;
  /** Build URL path for a route */
  buildPath: (name: string, params?: Params) => string;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
}
