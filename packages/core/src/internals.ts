import type { RouteTree } from "./engine";
import type { DependenciesStore } from "./namespaces";
import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { Router as RouterClass } from "./Router";
import type {
  DefaultDependencies,
  EventName,
  LoggerConfig,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  Router as RouterInterface,
  RouterLogger,
  RouteTreeState,
  SearchParams,
  SerializedRouterState,
  SimpleState,
  State,
  TreeChangedEvent,
  Unsubscribe,
  EventMethodMap,
  PluginFactory,
} from "./types";
import type { RouterValidator } from "./types/RouterValidator";

export interface RouterInternals<
  D extends DefaultDependencies = DefaultDependencies,
> {
  readonly makeState: <
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    name: string,
    params?: P,
    search?: S,
    path?: string,
    meta?: Record<string, Record<string, "url" | "query">>,
  ) => State<P, S>;

  readonly forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  readonly buildStateResolved: (
    resolvedName: string,
    resolvedParams: Params,
  ) => RouteTreeState | undefined;

  readonly matchPath: <P extends Params = Params>(
    path: string,
    options?: Options,
  ) => State<P> | undefined;

  readonly getOptions: () => Options;

  readonly addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  /**
   * Route-tree mutation channel — internal access for the `getRoutesApi`
   * wrapper. A dedicated bridge is required because the public
   * `addEventListener<E extends EventName>` structurally rejects
   * `"TREE_CHANGED"` (it is not in the public `EventName` union), is strict on
   * duplicates, and exposes neither `emit` nor `listenerCount`.
   */
  readonly treeChanged: {
    readonly emit: (event: TreeChangedEvent) => void;
    readonly subscribe: (
      handler: (event: TreeChangedEvent) => void,
    ) => Unsubscribe;
    readonly listenerCount: () => number;
    /**
     * True while a `TREE_CHANGED` emit is on the stack — `getRoutesApi` reads it
     * to reject reentrant route-CRUD from a `subscribeChanges` handler (#1032).
     */
    readonly isEmitting: () => boolean;
  };

  readonly buildPath: (
    route: string,
    params?: Params,
    search?: SearchParams,
  ) => string;

  readonly emitTransitionError: (error: Error) => void;

  /**
   * Emits `TRANSITION_SUCCESS` directly (no FSM transition) — used by
   * `getRoutesApi().replace()` to notify `router.subscribe` listeners when a
   * structural replace revalidates the active state (#950). Mirrors the success
   * emission `completeTransition` / `navigateToNotFound` perform.
   */
  readonly emitTransitionSuccess: (
    toState: State,
    fromState: State | undefined,
    opts?: NavigationOptions,
  ) => void;

  /**
   * Commits the not-found (`UNKNOWN_ROUTE`) state for `path` and emits
   * `TRANSITION_SUCCESS` — the `NavigationNamespace.navigateToNotFound`
   * primitive. `replace()` uses it when a structural replace drops the active
   * route, so subscribers are notified instead of the state silently clearing
   * (#950).
   */
  readonly navigateToNotFound: (path: string) => State;

  readonly start: (path: string) => Promise<State>;

  /**
   * Plugin-only navigation entry point — delegates to
   * `NavigationNamespace.navigateToState` (`getPluginApi(router).navigateToState`).
   * Hidden from `Router`/`Navigator` to keep the userland surface minimal;
   * see `core-types/src/api.ts` for usage docs.
   */
  readonly navigateToState: (
    state: State,
    options?: NavigationOptions,
  ) => Promise<State>;

  /* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous map: stores different InterceptorFn<M> types under different keys */
  readonly interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  readonly setRootPath: (rootPath: string) => void;
  readonly getRootPath: () => string;

  readonly getTree: () => RouteTree;

  readonly isDisposed: () => boolean;

  validator: RouterValidator | null;

  // Per-router logger instance (built from `options.logger` in the Router
  // constructor). The facade reads it as `getInternals(this).logger`; namespaces
  // receive it via their deps at wiring; plugins reach it through
  // `getPluginApi(router).logger`. Replaces the former process-global singleton
  // from the standalone `@real-router/logger` package (now folded into
  // `utils/logger`), whose `configure()` leaked across routers (#724).
  readonly logger: RouterLogger;

  // Dependencies (issue #172)
  readonly dependenciesGetStore: () => DependenciesStore<D>;

  // Clone support (issue #173, consolidated #964). One accessor for the
  // source-side snapshot a clone carries over besides the route store, so a new
  // clone-relevant subsystem is wired in a single place instead of being spread
  // across separate methods.
  readonly getCloneState: () => {
    options: Options;
    dependencies: Record<string, unknown>;
    pluginFactories: PluginFactory<D>[];
    // Resolved logger config of the base router, so a clone can build its OWN
    // logger inheriting the base's level/callback. Frozen `options` do NOT carry
    // `logger` (stripped in the constructor), so `options` above can't convey it;
    // cloneRouter merges a per-request override (traceId) over this snapshot.
    loggerConfig: LoggerConfig;
  };

  // Consolidated route data store (issue #174 Phase 2)
  readonly routeGetStore: () => RoutesStore<D>;

  // Cross-namespace state (issue #174)
  readonly getStateName: () => string | undefined;
  readonly isTransitioning: () => boolean;
  readonly clearState: () => void;
  readonly setState: (state: State) => void;
  readonly routerExtensions: { keys: string[] }[];
  readonly contextClaimRecords: Set<string>;

  /**
   * One-shot hydration scratchpad populated by `hydrateRouter` immediately
   * before delegating to `router.start(parsed.path)` and cleared in the
   * matching `finally`. SSR loader plugins read this slot directly via
   * `getInternals(router).hydrationState` to short-circuit their own loader
   * call when the server-resolved namespace value is already present in the
   * parsed state (#596). `null` outside of an active `hydrateRouter`
   * invocation.
   */
  hydrationState: SerializedRouterState | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential type: stores RouterInternals for all Dependencies types
const internals = new WeakMap<object, RouterInternals<any>>();

export function getInternals<D extends DefaultDependencies>(
  router: RouterInterface<D>,
): RouterInternals<D> {
  const ctx = internals.get(router);

  if (!ctx) {
    throw new TypeError(
      "[real-router] Invalid router instance — not found in internals registry",
    );
  }

  return ctx as RouterInternals<D>;
}

export function registerInternals<D extends DefaultDependencies>(
  router: RouterClass<D>,
  ctx: RouterInternals<D>,
): void {
  internals.set(router, ctx);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- internal chain execution: type safety enforced at public API boundary (PluginApi.addInterceptor) */
function executeInterceptorChain<T>(
  interceptors: ((next: (...args: any[]) => any, ...args: any[]) => any)[],
  original: (...args: any[]) => T,
  args: any[],
): T {
  let chain = original as (...args: any[]) => any;

  for (const interceptor of interceptors) {
    const prev = chain;

    chain = (...chainArgs: any[]) => interceptor(prev, ...chainArgs);
  }

  return chain(...args) as T;
}

/**
 * Variadic interceptor wrapper — wraps a function of any arity, returning the
 * same callable type `T`. Use {@link createBinaryInterceptable} instead when the
 * wrapped method takes exactly two args and the caller needs the precise
 * `(a, b) => r` signature preserved (the variadic form widens args to `any[]`).
 */
export function createInterceptable<T extends (...args: any[]) => any>(
  name: string,
  original: T,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
): T {
  return ((...args: any[]) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(...args);
    }

    return executeInterceptorChain(chain, original, args);
  }) as T;
}

/**
 * Two-argument interceptor wrapper — preserves the exact `(a: A, b: B) => R`
 * signature, which the variadic {@link createInterceptable} cannot express
 * (it widens args to `any[]`). Used for the binary interceptable methods
 * `forwardState(routeName, routeParams)` and `buildPath(route, params)`.
 */
export function createBinaryInterceptable<A, B, R>(
  name: string,
  original: (a: A, b: B) => R,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
): (a: A, b: B) => R {
  return (arg1: A, arg2: B) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(arg1, arg2);
    }

    return executeInterceptorChain(chain, original, [arg1, arg2]);
  };
}

/**
 * Three-argument interceptor wrapper — preserves the exact
 * `(a: A, b: B, c: C) => R` signature that the variadic
 * {@link createInterceptable} widens to `any[]`. Used for the search-aware
 * `buildPath(route, params, search)` interceptable (RFC-4 M2 / #1548): a legacy
 * two-arg interceptor stays valid (TS allows fewer params, and `next(a, b)`
 * leaves `c` `undefined` — the v1 single-bag path), while a search-aware
 * interceptor can read and forward the third argument.
 */
export function createTernaryInterceptable<A, B, C, R>(
  name: string,
  original: (a: A, b: B, c: C) => R,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
): (a: A, b: B, c: C) => R {
  return (arg1: A, arg2: B, arg3: C) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(arg1, arg2, arg3);
    }

    return executeInterceptorChain(chain, original, [arg1, arg2, arg3]);
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
