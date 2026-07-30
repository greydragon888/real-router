// packages/core/src/namespaces/RoutesNamespace/types.ts

import type { RouteResolver } from "../../pipeline";
import type {
  DefaultDependencies,
  ForwardToCallback,
  GuardFn,
  Params,
  ParamsSearch,
  RouterLogger,
  SearchParams,
  State,
  GuardFnFactory,
} from "../../types";
import type { RouterValidator } from "../../types/RouterValidator";

/**
 * Dependencies injected into RoutesNamespace.
 *
 * These are function references from the Router facade,
 * avoiding the need to pass the entire Router object.
 */
export interface RoutesDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  /**
   * The opt-in validator, resolved PER CALL — `null` until `validation-plugin`
   * installs one, and `null` again after its teardown. The same shared closure
   * EventBus / RouteLifecycle / Plugins receive; this namespace needs it for the
   * one boundary on it where USER code hands back a value core then builds a
   * state from (a route's `decodeParams`).
   */
  getValidator: () => RouterValidator | null;

  /**
   * The pipeline's read-model (`RouteResolver`), shared with NavigationNamespace
   * — one instance per router, created in `wireNamespaces`. Entry points on this
   * namespace compose their target state through `canonicalize` / `buildURL` /
   * `materialize` and reach the router's stage ① seam and route config through
   * this port rather than through the namespace's own dependency closures, so
   * every producer reads ONE read-model (nav-pipeline Phase 2).
   */
  port: RouteResolver;

  /**
   * Register a canActivate handler for a route. `precompiledFn` installs an
   * already-compiled `GuardFn` (from {@link compileGuard}) without re-invoking
   * the factory — used by the #956 prepare-then-commit path so guards compile
   * once, before the store swap.
   */
  addActivateGuard: (
    name: string,
    handler: GuardFnFactory<Dependencies>,
    precompiledFn?: GuardFn,
  ) => void;

  /** Register a canDeactivate handler for a route (see {@link addActivateGuard}). */
  addDeactivateGuard: (
    name: string,
    handler: GuardFnFactory<Dependencies>,
    precompiledFn?: GuardFn,
  ) => void;

  /**
   * Compile a guard factory to its `GuardFn` WITHOUT registering it — surfaces a
   * throwing / non-function factory eagerly so the add/replace commit can
   * validate every guard before swapping the store (#956).
   */
  compileGuard: (
    handler: GuardFnFactory<Dependencies>,
    methodName: string,
  ) => GuardFn;

  // `makeState` used to live here for `matchPath` and `isActiveRoute`. Both are
  // on the pipeline now (Phase 2, steps 2-2 and 2-5) and materialise their state
  // from a `Canonical` instead, so the closure lost its last caller.

  /** Get current router state */
  getState: () => State | undefined;

  /** Compare two states for equality */
  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;

  /** Get a dependency by name */
  getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K];

  // `forwardState` and `reportDroppedQueryKey` used to live here for
  // `matchPath`, its only consumer. Step 2-2 moved that entry point onto the
  // pipeline, which reaches the SAME seam through `port.resolveForward` and the
  // same drop reporter through `port.reportDroppedQueryKey`, leaving both
  // closures without a caller. ⚠ The `validateStateBuilderArgs` call that went
  // with them was NOT purely an internal intermediate, which is how its removal
  // was justified: of the two bags it saw, the matcher's output is indeed
  // router-produced, but a route's `decodeParams` is USER code and its return
  // value is external input. Only the matcher half was redundant — the decoder
  // half is back, at the decoder itself (#1582).
}

/**
 * Configuration storage for routes.
 * Stores decoders, encoders, default params, and forward mappings.
 */
export interface RouteConfig {
  /** Custom param decoders per route */
  decoders: Record<string, (channels: ParamsSearch) => ParamsSearch>;

  /** Custom param encoders per route */
  encoders: Record<string, (channels: ParamsSearch) => ParamsSearch>;

  /** Default params per route */
  defaultParams: Record<string, Params>;

  /** Default search (query) params per route (RFC-4 M2 / #1548) */
  defaultSearch: Record<string, SearchParams>;

  /** Forward mappings (source -> target) */
  forwardMap: Record<string, string>;

  /** Dynamic forward callbacks (source -> callback) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forwardFnMap: Record<string, ForwardToCallback<any>>;
}
