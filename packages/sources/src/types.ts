import type { Params, RouterError, State } from "@real-router/core";

export interface RouteSnapshot<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute: State | undefined;
}

export interface RouteNodeSnapshot<P extends Params = Params> {
  route: State<P> | undefined;
  previousRoute: State | undefined;
}

export interface RouterSource<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  destroy: () => void;
}

export interface ActiveRouteSourceOptions {
  strict?: boolean;
  ignoreQueryParams?: boolean;
  /**
   * URL fragment match (#532). When defined, the source is active iff the
   * route matches AND `state.context.url.hash` (decoded, populated by
   * browser/navigation URL plugins) equals this value:
   *
   * - `undefined` (default): hash is ignored — legacy route-only matching.
   * - `""`: active only when the current URL has no fragment (or empty).
   * - `"value"`: active only when the current fragment equals `"value"`.
   *
   * Hash-plugin runtimes leave `state.context.url` undefined, so any non-
   * undefined `hash` option will produce `false` there — consistent with the
   * documented limitation that hash-plugin doesn't support URL fragments.
   */
  hash?: string;
}

export interface RouterTransitionSnapshot {
  isTransitioning: boolean;
  isLeaveApproved: boolean;
  toRoute: State | null;
  fromRoute: State | null;
}

export interface RouterErrorSnapshot {
  error: RouterError | null;
  toRoute: State | null;
  fromRoute: State | null;
  version: number;
}

export interface DismissableErrorSnapshot {
  /** Currently visible error, or `null` if none (never seen or dismissed). */
  error: RouterError | null;
  /** Target route of the failed navigation. */
  toRoute: State | null;
  /** Source route at the time of failure. */
  fromRoute: State | null;
  /** Monotonic version counter from the underlying error source. */
  version: number;
  /** Dismisses the current error. Next error (new version) becomes visible again. */
  resetError: () => void;
}
