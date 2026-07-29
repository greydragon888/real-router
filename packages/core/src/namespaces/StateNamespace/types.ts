// packages/core/src/namespaces/StateNamespace/types.ts

import type { RouteResolver } from "../../pipeline";

/**
 * Dependencies injected from Router for state creation.
 */
export interface StateNamespaceDependencies {
  /**
   * The pipeline's read-model. `makeState` IS `canonicalize`'s literal form
   * since nav-pipeline Phase 4, so everything stage ③ and the mode gate used to
   * need here — the two default maps, the `?`-declaration registry, the mode
   * boolean, the drop reporter, the route-existence predicate and the URL
   * builder — is read through the port, by the one implementation, instead of
   * being re-derived by a second terminal. Seven members left with the
   * duplicate; `getUrlParams` below is the only one that never belonged to it.
   */
  port: () => RouteResolver;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
}
