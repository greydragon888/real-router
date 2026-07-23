// packages/core/src/namespaces/StateNamespace/types.ts

import type { Params, SearchParams } from "../../types";

/**
 * Dependencies injected from Router for state creation.
 */
export interface StateNamespaceDependencies {
  /** Get defaultParams config for a route */
  getDefaultParams: () => Record<string, Params>;
  /** Build URL path for a route */
  buildPath: (name: string, params?: Params, search?: SearchParams) => string;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
  /** Get declared query param names for a route (channel routing, #1549) */
  getQueryParams: (name: string) => string[];
}
