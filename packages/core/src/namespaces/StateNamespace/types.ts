// packages/core/src/namespaces/StateNamespace/types.ts

import type { Params, SearchParams } from "../../types";

/**
 * Dependencies injected from Router for state creation.
 */
export interface StateNamespaceDependencies {
  /** Get defaultParams config for a route */
  getDefaultParams: () => Record<string, Params>;
  /** Get defaultSearch config for a route (query-channel defaults, #1548) */
  getDefaultSearch: () => Record<string, SearchParams>;
  /** Build URL path for a route */
  buildPath: (name: string, params?: Params, search?: SearchParams) => string;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
}
