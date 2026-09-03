import { assertChannelCorrect } from "./channels";

import type { RouteTree } from "./engine";
import type { DependenciesStore } from "./namespaces";
import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { RouteResolver } from "./pipeline";
import type { Router as RouterClass } from "./Router";
import type {
  AnyOptions,
  ContextNamespaceClaim,
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
  InterceptableMethodMap,
  PluginFactory,
} from "./types";
import type { Limits } from "./types/internal";
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
   * Commits the not-found (`UNKNOWN_ROUTE`) state for `path` and emits
   * `TRANSITION_SUCCESS` — the `NavigationNamespace.navigateToNotFound`
   * primitive. `replace()` uses it when a structural replace drops the active
   * route, so subscribers are notified instead of the state silently clearing
   * (#950).
   */
  readonly navigateToNotFound: (path: string) => State;

  /**
   * The `replace()` revalidation's twin of the above: commits `UNKNOWN_ROUTE`
   * WITHOUT consulting the departing route's `canDeactivate` (#1652, #1981).
   * A tree swap is not a departure the user chose.
   */
  readonly revalidateToNotFound: (path: string) => State;

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
    // Resolved limits of the base router (#1880). Same reason as `loggerConfig`
    // one line up: `options.limits` is the caller's own bag, so a clone built
    // from it re-invokes an accessor there and can end up with a different cap
    // than its base. The base already resolved them to numbers; the clone
    // inherits that rather than re-reading.
    limits: Limits;
    // The KEY SET the base was CONSTRUCTED with (#1961). `limits` above carries
    // the resolved VALUES, which is what #1880 needed; the clone also needs to
    // know which of them the caller actually passed, because substituting the
    // whole resolved bag materialises the unset defaults into the clone's
    // reported options and `validation-plugin` refuses one such pair at install.
    //
    // ⚠ A snapshot rather than `Object.keys(options.limits)` at clone time,
    // which is what this replaced: `options.limits` is the caller's own object
    // and mutable — core freezes only the level it owns (#1832). Deleting a key
    // after construction left the base capped and every later clone uncapped.
    //
    // `undefined` — not `[]` — when the caller passed no bag at all, so the
    // clone can tell "nothing to substitute" from "an empty bag", which
    // `options.limits` itself still distinguishes (`undefined` vs `null` vs
    // `{}`) and which the clone must not flatten.
    //
    // ⚠ Handed out BY REFERENCE and therefore FROZEN at the source, exactly as
    // `limits` above is: `readonly string[]` is a compile-time claim and this
    // surface is reached by plugins through `@real-router/core/validation`.
    limitKeys: readonly string[] | undefined;
  };

  // Consolidated route data store (issue #174 Phase 2)
  readonly routeGetStore: () => RoutesStore<D>;

  // Cross-namespace state (issue #174)
  readonly getStateName: () => string | undefined;
  readonly isTransitioning: () => boolean;
  /**
   * Commit a state that is NOT the product of a navigation — the 404 bypass and
   * `replace()`'s revalidation. Writes AND announces through the FSM
   * `SYSTEM_COMMIT` action, so neither half happens outside the table.
   *
   * THROWS when the machine has no edge to take. The throw is NOT redundant
   * with the table: a refusal there is silent (a `send` from a state without an
   * edge is a no-op), and the contract these callers already had promises an
   * error, not a quietly skipped commit (#1186).
   *
   * Two codes, and the split is #1644's: `ROUTER_DISPOSED` only for a router
   * that IS disposed, `ROUTER_NOT_STARTED` for every other refusal — stopped,
   * never started, still STARTING, or mid-transition — because `SYSTEM_COMMIT`
   * is declared on `READY` alone and therefore also refuses routers that are
   * very much alive. The phase rides the message rather than the code.
   */
  readonly systemCommit: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => State;
  readonly routerExtensions: { keys: string[] }[];
  readonly contextClaimRecords: Map<string, ContextNamespaceClaim>;

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
  sanitiseNext?: (result: T) => T,
): T {
  let chain = original as (...args: any[]) => any;

  for (const interceptor of interceptors) {
    const prev = chain;
    // ⚑ The `next` an interceptor RECEIVES is wrapped, not the value it returns
    // (#1986). This covers exactly the boundaries nothing else does — `original`
    // into the first interceptor, and each interceptor into the one outside it —
    // and leaves the outermost hop's result to the seam's own exit copy.
    //
    // ⚠ The alternative, wrapping the RETURN, was built and measured rather
    // than argued about. It puts two mechanisms on that last boundary, and one
    // cell stops discriminating: "an interceptor's OWN poison does not leave the
    // door either". It does NOT make the exit copy redundant — the
    // no-interceptor fast path skips this chain entirely, so two other cells
    // still red that copy's removal either way.
    const next =
      sanitiseNext === undefined
        ? prev
        : (...nextArgs: any[]) => sanitiseNext(prev(...nextArgs) as T);

    chain = (...chainArgs: any[]) => interceptor(next, ...chainArgs);
  }

  return chain(...args) as T;
}

/**
 * THE interceptable seams, and the object the wrappers are NAMED from.
 *
 * `addInterceptor` refuses a name that is not a key here (#2088), so this is the
 * runtime half of a set whose compile-time half is {@link InterceptableMethodMap}
 * — and `satisfies` ties the two in BOTH directions rather than leaving them a
 * pair someone maintains: a seam added to the map fails this object to compile,
 * a key here that the map does not declare fails too, and the mapped type makes
 * a value that drifts from its key an error rather than a silent alias.
 *
 * ⚑ The three `create*Interceptable` call sites in `Router.ts` take their name
 * from THIS object rather than spelling a literal, which is what makes "the set
 * that decides is the set that acts" a check instead of a convention. A literal
 * at a call site could drift from the set; a property read cannot.
 */
export const SEAM = {
  start: "start",
  buildPath: "buildPath",
  forwardState: "forwardState",
} as const satisfies { [K in keyof InterceptableMethodMap]: K };

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
 *
 * ⚑ `sanitiseNext` is applied to whatever `next` hands an interceptor, at every
 * hop (#1986). It exists because `forwardState` returns CONTAINERS a plugin is
 * documented to merge, so what one interceptor hands the next is a hand-out in
 * the #1957 sense; `buildPath` returns a string and passes nothing. The seam
 * that needs it owns the function — this module only applies it.
 *
 * ⚠ It does NOT reach the chain's own return value. That one goes to the caller,
 * which is the seam's own business and already has an exit copy.
 */
export function createTernaryInterceptable<A, B, C, R>(
  name: string,
  original: (a: A, b: B, c: C) => R,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
  sanitiseNext?: (result: R) => R,
): (a: A, b: B, c: C) => R {
  return (arg1: A, arg2: B, arg3: C) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(arg1, arg2, arg3);
    }

    return executeInterceptorChain(
      chain,
      original,
      [arg1, arg2, arg3],
      sanitiseNext,
    );
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
