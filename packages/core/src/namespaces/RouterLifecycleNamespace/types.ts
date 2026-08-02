// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type { AnyOptions, NavigationOptions, Params, State } from "../../types";

export interface RouterLifecycleDependencies {
  // The erased view: these namespaces READ configuration (`defaultRoute`
  // truthiness, `allowNotFound`) — they never resolve a callback, which is
  // `resolveDefault`'s job. Taking `AnyOptions` keeps the dependency-map
  // generic out of every namespace that has no use for it.
  getOptions: () => AnyOptions;
  /**
   * Commit a fully-resolved State without re-running `forwardState`/`buildPath`.
   * `start(path)` uses this to commit `matchPath(path)` directly — the same
   * primitive URL plugins use on popstate / navigate-event (#525). Keeps
   * `state.path` identical to the source URL (preserves trailing slash in
   * `trailingSlash:"preserve"` mode) and avoids the redundant
   * forwardState+buildPath round-trip in `buildNavigateState`.
   */
  // `State | Promise<State>` since Step 0: the namespace answers synchronously
  // when the navigation settled synchronously. `start` is `async`, so both
  // shapes type-check and the committed state is identical — but they are not
  // timing-identical: returning a bare `State` costs one adoption tick instead
  // of three, so `router.start()` now settles TWO microtasks earlier on the
  // sync-commit path (measured). Only ever earlier, never later, and nothing in
  // the repo orders work against that gap — but it is a real observable, not a
  // transparent widening.
  navigateToState: (
    state: State,
    opts: NavigationOptions,
  ) => State | Promise<State>;
  navigateToNotFound: (path: string) => State;
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
