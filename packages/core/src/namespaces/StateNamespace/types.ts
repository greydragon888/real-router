// packages/core/src/namespaces/StateNamespace/types.ts

import type { RouteResolver } from "../../pipeline";

/**
 * Dependencies injected from Router for state creation.
 */
export interface StateNamespaceDependencies {
  /**
   * The pipeline's read-model. `makeState` IS `canonicalize`'s literal form
   * since nav-pipeline Phase 4, so everything stage ③ and the mode gate need —
   * the two default maps, the `?`-declaration registry, the mode boolean, the
   * drop reporter, the route-existence predicate and the URL builder — is read
   * through the port, by the one implementation, rather than re-derived by a
   * second terminal. Those seven belong to the duplicate; `getUrlParams` below
   * is the only member that does not.
   */
  port: () => RouteResolver;
  /** Get URL params for a route (for areStatesEqual) */
  getUrlParams: (name: string) => string[];
}
