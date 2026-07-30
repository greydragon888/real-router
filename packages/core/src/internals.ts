import { assertChannelCorrect } from "./channels";

import type { RouteTree } from "./engine";
import type { DependenciesStore } from "./namespaces";
import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { RouteResolver } from "./pipeline";
import type { Router as RouterClass } from "./Router";
import type {
  AnyOptions,
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
  ) => State<P, S>;

  /**
   * Per-segment param-source map for a route name (`{ segment: { param: "url" |
   * "query" } }`), read from the live matcher — the ownership channel for
   * `getTransitionPath` (RFC-4 M2 / #1548, replaced the removed per-State
   * `stateMetaStore` WeakMap). `undefined` when the name is not in the tree.
   */
  readonly getMetaForState: (
    name: string,
  ) => Record<string, Record<string, "url" | "query">> | undefined;

  /**
   * The route's DECLARED query-param names — the same registry the URL build
   * prints from (#1556), minus path slots. Feeds the always-on channel guard
   * (#1572); read here rather than re-derived, so classification cannot drift.
   */
  readonly getQueryParams: (name: string) => readonly string[];

  readonly forwardState: <
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    routeName: string,
    routeParams: P,
    routeSearch?: S,
  ) => SimpleState<P, S>;

  readonly buildStateResolved: (
    resolvedName: string,
    resolvedParams: Params,
  ) => RouteTreeState | undefined;

  readonly matchPath: <P extends Params = Params>(
    path: string,
    options?: AnyOptions,
  ) => State<P> | undefined;

  readonly getOptions: () => Options<D>;

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

  /**
   * The navigation pipeline's read-model, for entry points that live on this
   * plugin-facing surface rather than in a namespace. Resolved LAZILY: the port
   * is created during wiring, and `registerInternals` runs before that, so the
   * accessor is a closure rather than a value — the same shape the interceptable
   * methods above already use.
   */
  readonly port: () => RouteResolver;

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
    options: Options<D>;
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

/**
 * Channel guard, position P1 (#1572) — the caller's RAW `params` argument, at
 * the API boundary and BEFORE any interceptor runs, so what it reports is what
 * the CALLER wrote (a plugin's later injection is P2's population, not this one).
 *
 * THROWS. The warn-first step (#1572) announced the contract so every call site
 * could identify itself in the logs; this is the promotion it announced.
 *
 * A `TypeError`, synchronous, rather than a `RouterError` on a rejected promise:
 * this is an ARGUMENT-shape defect at the API boundary, caught before any
 * interceptor or transition exists — the same class as the `subscribe` /
 * `navigateToNotFound` / `start` guards beside it. Rejecting instead would let a
 * `.catch()` written for navigation failures swallow a programming error.
 *
 * P3 (`navigateToState`) keeps REJECTING — deliberately asymmetric, because it
 * takes a ready-made `State` from a popstate handler, where a new synchronous
 * throw would change an existing method's failure shape.
 *
 * The predicates (`buildPath` / `isActiveRoute` / `canNavigateTo`) are still NOT
 * instrumented: they run on every `<Link>` render, an answer there is read
 * immediately and corrupts nothing, and throwing inside a render in six adapters
 * is not a trade this guard is worth.
 *
 * ⚠ Not instrumented ≠ blind. `canNavigateTo` answers whether `navigate` WOULD
 * work, so it consults {@link findMisChanneledKey} directly and returns `false`
 * for a shape this function would have thrown on (#1576) — an answer, not a
 * throw, so the render-path trade above is untouched. `buildPath` /
 * `isActiveRoute` ask a different question and are unchanged.
 *
 * @internal
 */
export function throwOnMisChanneledKey<D extends DefaultDependencies>(
  ctx: RouterInternals<D>,
  method: string,
  routeName: string,
  params: Params | undefined,
): void {
  assertChannelCorrect(
    method,
    routeName,
    params,
    ctx.getQueryParams(routeName),
  );
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
 * same callable type `T`. Use {@link createTernaryInterceptable} instead when
 * the wrapped method takes exactly three args and the caller needs the precise
 * `(a, b, c) => r` signature preserved (the variadic form widens args to
 * `any[]`).
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
 * Three-argument interceptor wrapper — preserves the exact
 * `(a: A, b: B, c: C) => R` signature that the variadic
 * {@link createInterceptable} widens to `any[]`. Backs both search-aware
 * interceptables — `buildPath(route, params, search)` and
 * `forwardState(name, params, search)` (RFC-4 M2 / #1548). Every first-party
 * plugin registers the full three-argument form; a shorter-arity interceptor
 * from a third party remains type-valid (TS allows fewer params, and `next(a,
 * b)` leaves the third arg `undefined`).
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
