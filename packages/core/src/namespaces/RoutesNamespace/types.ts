// packages/core/src/namespaces/RoutesNamespace/types.ts

import type {
  DefaultDependencies,
  ForwardToCallback,
  GuardFn,
  Params,
  ParamsSearch,
  RouterLogger,
  SearchParams,
  SimpleState,
  State,
  GuardFnFactory,
} from "../../types";

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

  /** Create state object */
  makeState: <P extends Params = Params, S extends SearchParams = SearchParams>(
    name: string,
    params?: P,
    search?: S,
    path?: string,
  ) => State<P, S>;

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

  /** Forward state through facade (allows plugin interception) */
  forwardState: <
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    name: string,
    params: P,
    search?: S,
  ) => SimpleState<P, S>;
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

  /** Forward mappings (source -> target) */
  forwardMap: Record<string, string>;

  /** Dynamic forward callbacks (source -> callback) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forwardFnMap: Record<string, ForwardToCallback<any>>;
}
