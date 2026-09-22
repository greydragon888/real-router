import { assertChannelCorrect } from "./channels";
import { errorCodes } from "./constants";
import { RouterError, freezeThrownError } from "./RouterError";

import type { DependenciesStore } from "./dependenciesStore";
import type { RouteTree } from "./engine";
import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { RouteResolver } from "./pipeline";
import type { Router as RouterClass } from "./Router";
import type {
  AdoptedOrigins,
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
  SimpleState,
  State,
  TreeChangedEvent,
  Unsubscribe,
  EventMethodMap,
  InterceptableMethodMap,
  CheckPositionMap,
  DiagnosticEventMap,
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
  readonly getDeclaredQueryNames: (name: string) => readonly string[];

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

  /**
   * Print a path for an intent the caller has ALREADY resolved — the facade's
   * printer without the `forwardState` chain the facade runs above it (#2260).
   *
   * ⚑ **For a caller that ran the chain itself**, which is the href door:
   * `buildHref` resolves through `forwardState` (so the href is where the click
   * lands, #2250) and then prints, and until this member existed the printer it
   * reached ran the whole chain a second time (#2087). One href is one
   * operation, so a plugin's interceptor sees one pass.
   *
   * ⚠ **Not `port.buildPath`, which is also seam-free and is NOT the same
   * printer.** That one prints below the default merge; this terminal is
   * `canonicalize(…, { resolveForward: false })` + `buildURL`, the same form
   * `makeState` takes. Substituting it drops a route's `defaultParams` /
   * `defaultSearch` from every href, silently.
   */
  readonly buildPathResolved: (
    resolvedName: string,
    resolvedParams?: Params,
    resolvedSearch?: SearchParams,
  ) => string;

  readonly matchPath: <P extends Params = Params>(
    path: string,
    options?: AnyOptions,
  ) => State<P> | undefined;

  readonly getOptions: () => Options<D>;

  /**
   * Where the adopted option bags came from, weakly (#2148).
   *
   * ⚑ For the VALIDATION layer, and it is the only reason this door exists.
   * `@real-router/validation-plugin` derefs these at install, takes its own
   * snapshot, and reports once if the application mutates a bag afterwards —
   * because since #2171 such a mutation reaches nothing and says nothing.
   *
   * ⚠ An entry may deref to `undefined`, and that is the correct answer rather
   * than a failure: the application dropped its bag, so there is no mutation left
   * to make and nothing to report.
   */
  readonly getAdoptedOrigins: () => AdoptedOrigins;

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
  /**
   * Subscribes to one internal DIAGNOSTIC kind (#2388). The wiring path for
   * `PluginApi.subscribeDiagnostic`; core itself never listens.
   */
  readonly subscribeDiagnostic: <K extends keyof DiagnosticEventMap>(
    key: K,
    handler: (...args: DiagnosticEventMap[K]) => void,
  ) => Unsubscribe;

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
   * see `types/api.ts` for usage docs.
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

  /**
   * Checks registered per position (#2388) — the channel's whole state.
   *
   * ⚑ `readonly`, and that is load-bearing rather than tidy: the slot it
   * replaces (`validator`) was one of the two WRITABLE members that kept this
   * bag out of `Object.freeze`. A map mutated in place adds no writable member,
   * so retiring the validator still leaves the bag freezable.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous map: stores different CheckFn<P> types under different keys, exactly as `interceptors` above does */
  readonly checks: Map<string, ((...args: any[]) => void)[]>;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  readonly setRootPath: (rootPath: string) => void;
  readonly getRootPath: () => string;

  readonly getTree: () => RouteTree;

  readonly isDisposed: () => boolean;

  validator: RouterValidator | null;

  // Per-router logger instance (built from `options.logger` in the Router
  // constructor), so a `configure()` reaches one router rather than the process
  // (#724). The facade reads it as `getInternals(this).logger` and namespaces
  // receive it via their deps at wiring. ⚠ A plugin does NOT read it here — it
  // has `PluginApi.logger`, which #2339 added; the member survives for core's
  // own readers.
  //
  // ⚠ Handed out with no guard and no recorded carve-out — the one member of
  // this surface in that position (#2303). Its radius is diagnostics: nothing
  // routing reads it, so overwriting it silences messages rather than steering
  // anything.
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
    // ⚠ A snapshot, NOT `Object.keys(options.limits)` read at clone time:
    // `options.limits` is the caller's own object and mutable — core freezes
    // only the level it owns (#1832). Reading it late lets a key deleted after
    // construction leave the base capped and every later clone uncapped.
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential type: stores RouterInternals for all Dependencies types
const internals = new WeakMap<object, RouterInternals<any>>();

/**
 * "I am a router" — readable from OUTSIDE this module instance (#2294).
 *
 * ⚑ The registry above keys on object IDENTITY, so it misses for three
 * different things and the refusal has to say WHICH: an object that is not a
 * router, a PROXY over one (`reactive()` / Pinia — `packages/vue/CLAUDE.md`
 * documents the trap and its `markRaw` remedy), and a router built by ANOTHER
 * COPY of this package. The last is reachable by ordinary resolution: core is a
 * plain `dependency` of every adapter and plugin, a caret range on a `0.x`
 * version pins to the MINOR, and an application that updates core without its
 * adapter gets two copies with two registries.
 *
 * ⚑ `Symbol.for`, because nothing else answers across a module boundary.
 * `instanceof` and `#private in` are per-class and two copies have two classes;
 * a local symbol is per-module by construction. Measured: a real router carries
 * this, a transparent proxy forwards the read, a plain object does not.
 *
 * ⚠ It picks a MESSAGE and gates NOTHING, which is why a global symbol is
 * acceptable here where `packages/solid/src/components/RouteView/components.tsx`
 * chose a local one against spoofing — forging this buys a better error, not
 * access. The WeakMap still decides who is served.
 */
const ROUTER_BRAND = Symbol.for("real-router.router");

/**
 * Is this a real router, just not one THIS copy of core registered?
 *
 * ⚠ Read defensively: the argument is the caller's object and may be a `Proxy`
 * whose `get` trap throws — and a diagnostic that throws would change where the
 * error comes FROM, which is the #1572 class. A throwing read means "cannot
 * tell", and the generic message is the right answer then.
 */
function isForeignRouter(candidate: unknown): boolean {
  try {
    return (
      (candidate as Record<symbol, unknown> | null | undefined)?.[
        ROUTER_BRAND
      ] === true
    );
  } catch {
    return false;
  }
}

export function getInternals<D extends DefaultDependencies>(
  router: RouterInterface<D>,
): RouterInternals<D> {
  const ctx = internals.get(router);

  if (!ctx) {
    throw new TypeError(
      isForeignRouter(router)
        ? "[real-router] This IS a router, but not one this copy of @real-router/core built. " +
            "Core identifies a router by object identity, so it is either wrapped in a Proxy " +
            "(Vue `reactive()` / Pinia — store it with `markRaw`), or your dependency tree holds " +
            "two copies of @real-router/core — dedupe it to one."
        : "[real-router] Invalid router instance — not found in internals registry",
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
    ctx.getDeclaredQueryNames(routeName),
  );
}

/**
 * Refuses a call on a disposed router with a frozen `ROUTER_DISPOSED`.
 *
 * ⚑ Both door families make this refusal — the standalone doors in `api/` and
 * the `RouterInternals` adapters `Router.ts` registers — so it lives here,
 * below both. Nothing else in `src/` imports from `api/`: the
 * `import-x/no-restricted-paths` zone in `packages/core/eslint.config.mjs`
 * holds that.
 */
export function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw freezeThrownError(
      new RouterError(errorCodes.ROUTER_DISPOSED, {
        message: "[router] this router is disposed — dispose() is terminal",
      }),
    );
  }
}

export function registerInternals<D extends DefaultDependencies>(
  router: RouterClass<D>,
  ctx: RouterInternals<D>,
): void {
  internals.set(router, ctx);

  // On the INSTANCE rather than the prototype: this module holds `Router` as a
  // type only, and importing the class to brand its prototype would close a
  // cycle. Non-enumerable by `defineProperty`'s defaults, so no surface census
  // sees it.
  Object.defineProperty(router, ROUTER_BRAND, { value: true });
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- internal chain and check execution: type safety enforced at the public API boundary (`PluginApi.addInterceptor` / `PluginApi.addCheck`) */
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
  forwardState: "forwardState",
} as const satisfies { [K in keyof InterceptableMethodMap]: K };

/**
 * The runtime half of the check channel (#2388) — the same pair-with-the-type
 * construction {@link SEAM} uses, for the same reason.
 *
 * ⚑ A position added to {@link CheckPositionMap} and not here fails this object
 * to compile; a key here the map does not declare fails too; and the mapped type
 * makes a value that drifts from its key an error rather than a silent alias.
 * The call sites below read a PROPERTY of this object rather than spelling a
 * literal, so the set that decides is the set that acts.
 */
/**
 * The runtime half of the diagnostic channel (#2388) — the same
 * pair-with-the-type construction {@link SEAM} and {@link POSITION} use.
 *
 * ⚑ A key added to {@link DiagnosticEventMap} and not here fails this object to
 * compile, and a value drifting from its key is an error rather than a silent
 * alias.
 */
export const DIAGNOSTIC = {
  PLUGIN_AFTER_START: "PLUGIN_AFTER_START",
} as const satisfies { [K in keyof DiagnosticEventMap]: K };

export const POSITION = {
  "buildPath:params": "buildPath:params",
  "buildPathResolved:params": "buildPathResolved:params",
  "canNavigateTo:entry": "canNavigateTo:entry",
  "canNavigateTo:params": "canNavigateTo:params",
  "navigate:entry": "navigate:entry",
  "navigate:params": "navigate:params",
  "addRoute:batch": "addRoute:batch",
  "replaceRoutes:batch": "replaceRoutes:batch",
  "removeRoute:entry": "removeRoute:entry",
  "updateRoute:entry": "updateRoute:entry",
  "hasRoute:entry": "hasRoute:entry",
  "getRoute:entry": "getRoute:entry",
  "forwardState:entry": "forwardState:entry",
  "buildNavigationState:state": "buildNavigationState:state",
  "addActivateGuard:entry": "addActivateGuard:entry",
  "addDeactivateGuard:entry": "addDeactivateGuard:entry",
  "removeActivateGuard:entry": "removeActivateGuard:entry",
  "removeDeactivateGuard:entry": "removeDeactivateGuard:entry",
} as const satisfies { [K in keyof CheckPositionMap]: K };

/**
 * Runs every check registered at a position, in registration order.
 *
 * ⚠ **No `try`/`catch` and no collecting.** A check exists to refuse, so its
 * throw is the answer and the first one wins — wrapping would turn a refusal
 * into a log, and collecting would hand the caller a second opinion about a
 * value already refused.
 *
 * ⚑ **Re-entrancy is expected rather than guarded against.** A plugin's own
 * registration pass reaches core doors — `@real-router/validation-plugin` walks
 * the route table through `getRoutesApi` while installing — so a check can be
 * asked while the plugin that registered it is still starting.
 *
 * ⚠ **The list is read by INDEX, bounded by its length at entry**, and both
 * halves are deliberate. `for…of` over a live array sees what a check appends to
 * it mid-run — measured, a check that registers another had the new one called
 * by the same call — and copying the array would allocate on `buildPath`, which
 * is the render path. So a registration made during a run is not seen by that
 * run, and a removal made during one simply is not called.
 */
export function runChecks<P extends keyof CheckPositionMap>(
  checks: ReadonlyMap<string, ((...args: any[]) => void)[]>,
  position: P,
  ...args: CheckPositionMap[P]
): void {
  const registered = checks.get(position);

  if (registered === undefined) {
    return;
  }

  const atEntry = registered.length;

  for (let i = 0; i < atEntry && i < registered.length; i++) {
    registered[i](...args);
  }
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
 * {@link createInterceptable} widens to `any[]`. Backs the search-aware
 * interceptable `forwardState(name, params, search)` (RFC-4 M2 / #1548). Every
 * first-party plugin registers the full three-argument form; a shorter-arity
 * interceptor from a third party remains type-valid (TS allows fewer params,
 * and `next(a, b)` leaves the third arg `undefined`).
 *
 * ⚑ `sanitiseNext` is applied to whatever `next` hands an interceptor, at every
 * hop (#1986). It exists because `forwardState` returns CONTAINERS a plugin is
 * documented to merge, so what one interceptor hands the next is a hand-out in
 * the #1957 sense. The seam that needs it owns the function — this module only
 * applies it.
 *
 * ⚠ It does NOT reach the chain's own return value. That one goes to the caller,
 * which is the seam's own business and already has an exit copy.
 *
 * ⚑ `prepareArgs` shapes what the FIRST interceptor is handed, and it runs only
 * on the non-empty branch below (#1849). That placement is the whole of its
 * affordability: with no interceptor registered the wrapper takes `original`
 * directly and pays nothing, so the cost falls on the configuration that
 * created the need. What the seam does with it is the seam's business, as with
 * `sanitiseNext`.
 *
 * ⚠ Both are REQUIRED. One seam is left and both of its wrappers supply both,
 * so an optional slot would be a branch nothing takes — the shape a coverage
 * threshold catches and a reader does not.
 */
export function createTernaryInterceptable<A, B, C, R>(
  name: string,
  original: (a: A, b: B, c: C) => R,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
  sanitiseNext: (result: R) => R,
  prepareArgs: (a: A, b: B, c: C) => [A, B, C],
): (a: A, b: B, c: C) => R {
  return (arg1: A, arg2: B, arg3: C) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(arg1, arg2, arg3);
    }

    return executeInterceptorChain(
      chain,
      original,
      prepareArgs(arg1, arg2, arg3),
      sanitiseNext,
    );
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
