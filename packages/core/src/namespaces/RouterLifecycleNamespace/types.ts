// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type { NavigationOptions, Options, Params, State } from "../../types";

export interface RouterLifecycleDependencies {
  getOptions: () => Options;
  /**
   * Commit a fully-resolved State without re-running `forwardState`/`buildPath`.
   * `start(path)` uses this to commit `matchPath(path)` directly — the same
   * primitive URL plugins use on popstate / navigate-event (#525). Keeps
   * `state.path` identical to the source URL (preserves trailing slash in
   * `trailingSlash:"preserve"` mode) and avoids the redundant
   * forwardState+buildPath round-trip in `buildNavigateState`.
   */
  navigateToState: (state: State, opts: NavigationOptions) => Promise<State>;
  navigateToNotFound: (path: string) => State;
  clearState: () => void;
  matchPath: <P extends Params = Params>(path: string) => State<P> | undefined;
  completeStart: () => void;
  /** True when the FSM is back at IDLE — used to detect a stop() that cancelled a parked start (#1185). */
  isIdle: () => boolean;
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: Error,
  ) => void;
}
