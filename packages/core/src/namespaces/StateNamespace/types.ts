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
  /** Declared `?query` names — the mode gate's admission list (#1575) */
  getQueryParams: (name: string) => readonly string[];
  /** `true` exactly for `queryParamsMode: "loose"` — the mode gate (#1575) */
  admitsUndeclaredQuery: () => boolean;
  /**
   * The gate's opt-in reporter, or `undefined` when no validator is installed —
   * resolved per call, since `validation-plugin` registers after wiring (#1575).
   */
  getDropReporter: () => ((routeName: string, key: string) => void) | undefined;
}
