// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { logger } from "@real-router/logger";

import { EMPTY_PARAMS, errorCodes } from "./constants";
import { EventEmitter } from "./foundation/event-emitter";
import { createRouterFSM } from "./fsm";
import { guardDependencies, guardRouteStructure } from "./guards";
import { createLimits, normalizeParams } from "./helpers";
import {
  createBinaryInterceptable,
  createInterceptable,
  getInternals,
  registerInternals,
} from "./internals";
import {
  EventBusNamespace,
  NavigationNamespace,
  OptionsNamespace,
  PluginsNamespace,
  RouteLifecycleNamespace,
  RouterLifecycleNamespace,
  RoutesNamespace,
  StateNamespace,
  createDependenciesStore,
} from "./namespaces";
import { CACHED_ALREADY_STARTED_ERROR } from "./namespaces/RouterLifecycleNamespace/constants";
import { RouterError } from "./RouterError";
import { getTransitionPath } from "./transitionPath";
import { assertLoggerConfig } from "./typeGuards";
import { wireNamespaces } from "./wiring";

import type { RouterInternals } from "./internals";
import type { DependenciesStore } from "./namespaces";
import type { Limits, PluginFactory, Route, RouterEventMap } from "./types";
import type {
  DefaultDependencies,
  LeaveFn,
  NavigationOptions,
  Options,
  Params,
  Router as RouterInterface,
  State,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";
import type { CreateMatcherOptions } from "engine";

const EMPTY_OPTS: Readonly<NavigationOptions> = Object.freeze({});

// Module-level so #isExpectedRejection allocates nothing per navigate()/start() call.
// These are expected navigation outcomes owned by the caller, not internal
// bugs — the safety net stays silent for them and lets awaiting callers see
// the rejection. CANNOT_ACTIVATE / CANNOT_DEACTIVATE belong here: a guard
// blocking (or a plugin's guard-blocked back()/forward()) is a normal result,
// so a fire-and-forget call must not emit a spurious "Unexpected navigation
// error" (#721).
const SUPPRESSED_ERROR_CODES: ReadonlySet<string> = new Set([
  errorCodes.SAME_STATES,
  errorCodes.TRANSITION_CANCELLED,
  errorCodes.ROUTER_NOT_STARTED,
  errorCodes.ROUTE_NOT_FOUND,
  errorCodes.CANNOT_ACTIVATE,
  errorCodes.CANNOT_DEACTIVATE,
]);

// Shared per-listener error sink: the EventEmitter reports synchronous listener
// throws through it, and the EventBusNamespace.subscribe wrapper routes an async
// listener's rejected Promise through the SAME sink (#944) so both failure modes
// land in one place.
function logListenerError(eventName: string, error: unknown): void {
  logger.error("Router", `Error in listener for ${eventName}:`, error);
}

/**
 * Router class with integrated namespace architecture.
 *
 * All functionality is provided by namespace classes:
 * - OptionsNamespace: getOptions (immutable)
 * - DependenciesStore: get/set/remove dependencies
 * - EventEmitter: subscribe
 * - StateNamespace: state storage (getState, setState, getPreviousState)
 * - RoutesNamespace: route tree operations
 * - RouteLifecycleNamespace: canActivate/canDeactivate guards
 * - PluginsNamespace: plugin lifecycle
 * - NavigationNamespace: navigate
 * - RouterLifecycleNamespace: start, stop, isStarted
 *
 * @internal This class implementation is internal. Use createRouter() instead.
 */
export class Router<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> implements RouterInterface<Dependencies> {
  [key: string]: unknown;

  // ============================================================================
  // Namespaces
  // ============================================================================

  readonly #options: OptionsNamespace;
  readonly #limits: Limits;
  readonly #dependenciesStore: DependenciesStore<Dependencies>;
  readonly #state: StateNamespace;
  readonly #routes: RoutesNamespace<Dependencies>;
  readonly #routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  readonly #plugins: PluginsNamespace<Dependencies>;
  readonly #navigation: NavigationNamespace;
  readonly #lifecycle: RouterLifecycleNamespace;

  readonly #eventBus: EventBusNamespace;

  // ============================================================================
  // Constructor
  // ============================================================================

  /**
   * @param routes - Route definitions
   * @param options - Router options
   * @param dependencies - DI dependencies
   */
  constructor(
    routes: Route<Dependencies>[] = [],
    options: Partial<Options> = {},
    dependencies: Dependencies = {} as Dependencies,
  ) {
    // Extract the logger config WITHOUT mutating the caller's `options` object
    // (#724). NOTE: `logger` (from @real-router/logger) is a process-global
    // singleton — `configure()` applies process-wide and the last call wins
    // across every router in the process. `routerOptions` is the logger-stripped
    // view handed to the options pipeline so `logger` never lands in the frozen
    // router options.
    const { logger: loggerConfig, ...routerOptions } = options;

    if (loggerConfig) {
      assertLoggerConfig(loggerConfig);
      logger.configure(loggerConfig);
    }

    // =========================================================================
    // Validate inputs before creating namespaces
    // =========================================================================

    // Always validate the caller's options (catches non-object / array inputs)
    OptionsNamespace.validateOptionsIsObject(options);

    // Unconditional guard-level validation before creating namespaces
    guardDependencies(dependencies);

    // Stryker disable next-line EqualityOperator: equivalent — `>= 0` is always true, but `guardRouteStructure([])` on an empty array is a no-op, so validating an empty list behaves identically to skipping it. (ConditionalExpression stays live: `→false` skips validation of a real route list and is killable.)
    if (routes.length > 0) {
      guardRouteStructure(routes);
    }

    // =========================================================================
    // Create Namespaces
    // =========================================================================

    this.#options = new OptionsNamespace(routerOptions);
    this.#limits = createLimits(routerOptions.limits);
    this.#dependenciesStore =
      createDependenciesStore<Dependencies>(dependencies);
    this.#state = new StateNamespace();
    this.#routes = new RoutesNamespace<Dependencies>(
      routes,
      deriveMatcherOptions(this.#options.get()),
    );
    this.#routeLifecycle = new RouteLifecycleNamespace<Dependencies>();
    this.#plugins = new PluginsNamespace<Dependencies>();
    this.#navigation = new NavigationNamespace();
    this.#lifecycle = new RouterLifecycleNamespace();

    // =========================================================================
    // Initialize EventBus
    // =========================================================================

    const routerFSM = createRouterFSM();

    const emitter = new EventEmitter<RouterEventMap>({
      onListenerError: logListenerError,
      onListenerWarn: (eventName, count) => {
        logger.warn(
          "router.addEventListener",
          `Event "${eventName}" has ${count} listeners — possible memory leak`,
        );
      },
    });

    this.#eventBus = new EventBusNamespace({
      routerFSM,
      emitter,
      // The FSM CANCEL action aborts the in-flight
      // navigation controller via this injected effect — "FSM CANCEL ⟹
      // controller aborted" in one place. `#navigation` is constructed above.
      abortController: (reason) => {
        this.#navigation.abortCurrentController(reason);
      },
    });

    // =========================================================================
    // Register Internals (WeakMap for plugin/infrastructure access)
    // =========================================================================
    // Registered BEFORE wiring (#1331) so every namespace's deps-closure sees a
    // router already present in the internals registry — `getInternals(router)`
    // never throws during wiring, and guard factories flushed at the end of the
    // constructor see a fully-registered instance.

    const interceptorsMap: RouterInternals["interceptors"] = new Map();

    registerInternals(this, {
      makeState: (name, params, path, meta) =>
        this.#state.makeState(name, params, path, meta),
      // `as unknown as` is required: createBinaryInterceptable returns a
      // non-generic `(a: A, b: B) => R`, but RouterInternals["forwardState"]
      // is declared with a generic parameter `<P extends Params = Params>`,
      // which tsc will not infer from the non-generic source. Sonar S4325
      // misclassifies this as a redundant cast.
      forwardState: createBinaryInterceptable(
        "forwardState",
        (name: string, params: Params) =>
          this.#routes.forwardState(name, params),
        interceptorsMap,
      ) as unknown as RouterInternals["forwardState"],
      buildStateResolved: (name, params) =>
        this.#routes.buildStateResolved(name, params),
      matchPath: (path, matchOptions) =>
        this.#routes.matchPath(path, matchOptions),
      getOptions: () => this.#options.get(),
      addEventListener: (eventName, cb) =>
        this.#eventBus.addEventListener(eventName, cb),
      treeChanged: {
        emit: (event) => {
          this.#eventBus.emitTreeChanged(event);
        },
        subscribe: (handler) => this.#eventBus.subscribeTreeChanged(handler),
        listenerCount: () => this.#eventBus.treeChangedListenerCount(),
        isEmitting: () => this.#eventBus.isEmittingTreeChanged(),
      },
      buildPath: createBinaryInterceptable(
        "buildPath",
        (route: string, params?: Params) =>
          this.#routes.buildPath(
            route,
            params ?? EMPTY_PARAMS,
            this.#options.get(),
          ),
        interceptorsMap,
      ),
      emitTransitionError: (error) => {
        this.#eventBus.sendFailSafe(undefined, this.#state.get(), error);
      },
      emitTransitionSuccess: (toState, fromState, opts) => {
        this.#eventBus.emitTransitionSuccess(toState, fromState, opts);
      },
      navigateToNotFound: (path) => this.#navigation.navigateToNotFound(path),
      start: createInterceptable(
        "start",
        (path: string) => {
          return this.#lifecycle.start(path);
        },
        interceptorsMap,
      ),
      navigateToState: (state, navOpts) => {
        // Plugin-only navigation primitive (#525). Mirrors the same
        // unhandled-rejection suppression and lastSync* bookkeeping used by
        // the public Router.navigate facade so plugin call-sites can
        // fire-and-forget the returned promise (popstate handlers do).
        this.#assertNotReentrant();

        const promiseState = this.#navigation.navigateToState(
          state,
          navOpts ?? EMPTY_OPTS,
        );

        if (this.#navigation.lastSyncResolved) {
          this.#navigation.lastSyncResolved = false;
        } else if (this.#navigation.lastSyncRejected) {
          this.#navigation.lastSyncRejected = false;
        } else {
          Router.#suppressUnhandledRejection(promiseState);
        }

        return promiseState;
      },
      interceptors: interceptorsMap,
      setRootPath: (rootPath) => {
        this.#routes.setRootPath(rootPath);
      },
      getRootPath: () => this.#routes.getStore().rootPath,
      getTree: () => this.#routes.getStore().tree,
      isDisposed: () => this.#eventBus.isDisposed(),
      validator: null,
      // Dependencies (issue #172)
      dependenciesGetStore: () => this.#dependenciesStore,
      // Clone support (issue #173)
      getCloneState: () => ({
        options: { ...this.#options.get() },
        dependencies: { ...this.#dependenciesStore.dependencies },
        pluginFactories: this.#plugins.getAll(),
      }),
      routeGetStore: () => this.#routes.getStore(),
      // Cross-namespace state (issue #174)
      getStateName: () => this.#state.get()?.name,
      isTransitioning: () => this.#eventBus.isTransitioning(),
      clearState: () => {
        this.#state.set(undefined);
      },
      setState: (state) => {
        this.#state.set(state);
      },
      routerExtensions: [],
      contextClaimRecords: new Set(),
      hydrationState: null,
    });

    // =========================================================================
    // Wire Dependencies
    // =========================================================================

    wireNamespaces<Dependencies>({
      router: this,
      options: this.#options,
      limits: this.#limits,
      dependenciesStore: this.#dependenciesStore,
      state: this.#state,
      routes: this.#routes,
      routeLifecycle: this.#routeLifecycle,
      plugins: this.#plugins,
      navigation: this.#navigation,
      lifecycle: this.#lifecycle,
      eventBus: this.#eventBus,
    });

    // =========================================================================
    // Bind Public Methods
    // =========================================================================
    // All public methods that access private fields must be bound to preserve
    // `this` context when methods are extracted as references.
    // See: https://github.com/tc39/proposal-bind-operator
    // =========================================================================

    // Path & State Building
    this.isActiveRoute = this.isActiveRoute.bind(this);
    this.buildPath = this.buildPath.bind(this);

    // State Management
    this.getState = this.getState.bind(this);
    this.getPreviousState = this.getPreviousState.bind(this);
    this.areStatesEqual = this.areStatesEqual.bind(this);
    this.shouldUpdateNode = this.shouldUpdateNode.bind(this);

    // Router Lifecycle
    this.isActive = this.isActive.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.dispose = this.dispose.bind(this);

    // Route Lifecycle (Guards)
    this.canNavigateTo = this.canNavigateTo.bind(this);

    // Plugins
    this.usePlugin = this.usePlugin.bind(this);

    // Navigation
    this.navigate = this.navigate.bind(this);
    this.navigateToDefault = this.navigateToDefault.bind(this);
    this.navigateToNotFound = this.navigateToNotFound.bind(this);

    // Subscription
    this.subscribe = this.subscribe.bind(this);
    this.subscribeLeave = this.subscribeLeave.bind(this);
    this.isLeaveApproved = this.isLeaveApproved.bind(this);

    // =========================================================================
    // Flush initial-route guard factories
    // =========================================================================
    // Deferred out of wiring (#1331): the pending canActivate/canDeactivate
    // factories from initial route definitions are compiled and executed HERE,
    // on the fully-built and bound router — a factory calling read-only methods
    // (`buildPath()`, `isActiveRoute()`, `getState()`) no longer hits a
    // half-assembled instance. Side-effectful calls (`navigate`, `usePlugin`,
    // route-CRUD) stay OUT OF CONTRACT: factories re-execute outside the
    // constructor (cloneRouter re-compiles definition guards per clone;
    // #recompileSlot re-runs a factory after a definition-only clear), so any
    // side effect would duplicate per re-execution — see CLAUDE.md. Runtime
    // add()/replace() compile guards in their own PREPARE phase and never touch
    // these pending maps.
    //
    // Fail-closed on a factory throw: by this point a router reference leaked
    // from an earlier factory is fully operational, while later guards would
    // stay silently unregistered — a fail-open guard bypass. Disposing before
    // the rethrow turns any leaked reference into a ROUTER_DISPOSED-throwing
    // husk (pre-#1331 such a reference was inert because getInternals threw).
    try {
      this.#routes.flushPendingGuards();
    } catch (error) {
      this.dispose();

      throw error;
    }
  }

  // ============================================================================
  // Path & State Building
  // ============================================================================

  isActiveRoute(
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ): boolean {
    getInternals(this).validator?.routes.validateIsActiveRouteArgs(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );

    getInternals(this).validator?.routes.validateRouteName(
      name,
      "isActiveRoute",
    );

    // Empty string is special case - warn and return false (root node is not a parent)
    if (name === "") {
      logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. Root node is not considered a parent of any route.',
      );

      return false;
    }

    return this.#routes.isActiveRoute(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );
  }

  buildPath(route: string, params?: Params): string {
    const ctx = getInternals(this);

    ctx.validator?.routes.validateBuildPathArgs(route);
    ctx.validator?.navigation.validateParams(params, "buildPath");

    return ctx.buildPath(route, normalizeParams(params));
  }

  // ============================================================================
  // State Management (delegated to StateNamespace)
  // ============================================================================

  getState<P extends Params = Params>(): State<P> | undefined {
    return this.#state.get<P>();
  }

  getPreviousState(): State | undefined {
    return this.#state.getPrevious();
  }

  areStatesEqual(
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams = true,
  ): boolean {
    getInternals(this).validator?.state.validateAreStatesEqualArgs(
      state1,
      state2,
      ignoreQueryParams,
    );

    return this.#state.areStatesEqual(state1, state2, ignoreQueryParams);
  }

  shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    getInternals(this).validator?.routes.validateShouldUpdateNodeArgs(nodeName);

    return RoutesNamespace.shouldUpdateNode(nodeName);
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isActive(): boolean {
    return this.#eventBus.isActive();
  }

  start(startPath: string): Promise<State> {
    if (!this.#eventBus.canStart()) {
      return Promise.reject(CACHED_ALREADY_STARTED_ERROR);
    }

    getInternals(this).validator?.navigation.validateStartArgs(startPath);

    // FSM bookkeeping is split across the facade and RouterLifecycleNamespace by
    // design, NOT a missed consolidation (#940): `sendStart()` runs HERE, before
    // the interceptor chain, so the STARTING window spans the whole start
    // pipeline. A pre-`next()` interceptor throw then unwinds via STARTING →
    // `sendFail`, which emits TRANSITION_ERROR from STARTING (EventBusNamespace
    // FAIL action) for `onTransitionError` plugins. Moving `sendStart()` into the
    // namespace (the interceptor *target*) would skip STARTING on a pre-`next()`
    // throw — the namespace is never reached — silently dropping that
    // TRANSITION_ERROR: a #668 regression. The commit (`completeStart`) lives in
    // the namespace; recovery needs facade state (`#state`, `#lifecycle`), so it
    // stays here in `#unwindFailedStart`.
    this.#eventBus.sendStart();

    // Convert sync interceptor throws to rejections so the recovery path is
    // reachable; otherwise the throw escapes synchronously, the FSM is left in
    // STARTING, and the router is permanently bricked (#668).
    let internalStart: Promise<State>;

    try {
      const chainResult: unknown = getInternals(this).start(startPath);

      // A `start` interceptor that returns without calling next() yields a
      // non-thenable (typically undefined); the `.catch` below would then throw
      // a cryptic `TypeError: ...reading 'catch'` and leave the FSM stuck in
      // STARTING. Reject with an actionable message so recovery unwinds via
      // #unwindFailedStart — the same deferred-crash class as the #939
      // start-path guard (#1411).
      internalStart =
        typeof (chainResult as { then?: unknown } | null | undefined)?.then ===
        "function"
          ? (chainResult as Promise<State>)
          : Promise.reject(
              new TypeError(
                "[router.start] a `start` interceptor returned without calling next(). Every start interceptor must return `next(path)`.",
              ),
            );
    } catch (syncError: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided start interceptor
      internalStart = Promise.reject(syncError);
    }

    const promiseState = internalStart.catch((error: unknown) =>
      this.#unwindFailedStart(error),
    );

    Router.#suppressUnhandledRejection(
      promiseState,
      Router.#onSuppressedStartError,
    );

    return promiseState;
  }

  stop(): this {
    // SendCancelIfPossible → FSM CANCEL → the CANCEL action
    // aborts the in-flight controller (waking the pipeline). No separate abort.
    this.#eventBus.sendCancelIfPossible(this.#state.get());

    // `isStarting()` is included (#1185): a stop() while `start()` is parked in
    // an async start-interceptor (FSM STARTING, before `next()`) must cancel the
    // start, not silently no-op. `sendStop()` takes STARTING → IDLE (FSM table),
    // and `RouterLifecycleNamespace.start` re-checks `isIdle()` after the
    // interceptor chain and rejects with TRANSITION_CANCELLED — mirroring the
    // guard-phase behavior (which already cancels from TRANSITION_STARTED).
    if (
      !this.#eventBus.isReady() &&
      !this.#eventBus.isTransitioning() &&
      !this.#eventBus.isStarting()
    ) {
      return this;
    }

    this.#lifecycle.stop();
    this.#eventBus.sendStop();

    return this;
  }

  dispose(): void {
    // Stryker disable next-line BlockStatement: equivalent — emptying the early-return re-runs the dispose body on a 2nd call, but it is fully idempotent (FSM `send(DISPOSE)` no-ops from DISPOSED, `disposeAll()` already cleared `#unsubscribes`, every clear is idempotent). (ConditionalExpression stays live: `→true` always-returns and never disposes = killed.)
    if (this.#eventBus.isDisposed()) {
      return;
    }

    // the FSM CANCEL action aborts the in-flight controller.
    this.#eventBus.sendCancelIfPossible(this.#state.get());

    if (this.#eventBus.isReady() || this.#eventBus.isTransitioning()) {
      this.#lifecycle.stop();
      this.#eventBus.sendStop();
    }

    this.#eventBus.sendDispose();
    this.#eventBus.clearAll();

    this.#plugins.disposeAll();

    // Safety net: clean up extensions plugins failed to remove in teardown
    const ctx = getInternals(this);

    for (const extension of ctx.routerExtensions) {
      for (const key of extension.keys) {
        delete (this as Record<string, unknown>)[key];
      }
    }

    ctx.routerExtensions.length = 0;

    // Safety net: release context namespace claims plugins failed to release in teardown
    ctx.contextClaimRecords.clear();

    // Safety net: drop interceptors plugins failed to remove in teardown (#1199).
    // The third per-plugin registration channel — symmetric with routerExtensions
    // / contextClaimRecords above. `buildPath` is not method-swapped by dispose
    // and reads this Map live, so a leaked interceptor would otherwise still run
    // on the disposed router.
    ctx.interceptors.clear();

    this.#routes.clearRoutes();
    this.#routeLifecycle.clearAll();
    this.#state.reset();
    this.#dependenciesStore.dependencies = Object.create(
      null,
    ) as Partial<Dependencies>;

    this.#markDisposed();
  }

  // ============================================================================
  // Route Lifecycle (Guards)
  // ============================================================================

  canNavigateTo(name: string, params?: Params): boolean {
    const ctx = getInternals(this);

    ctx.validator?.routes.validateRouteName(name, "canNavigateTo");
    ctx.validator?.navigation.validateParams(params, "canNavigateTo");

    if (!this.#routes.hasRoute(name)) {
      return false;
    }

    const { name: resolvedName, params: resolvedParams } = ctx.forwardState(
      name,
      params ?? {},
    );

    // Build `toState` exactly as `buildNavigateState` does — WITH route-meta and
    // normalized params — so `getTransitionPath` takes its STANDARD PATH and
    // trims the shared ancestor, mirroring navigate's guard set (#970). A
    // meta-less `toState` makes both sides meta-less (the committed `getState()`
    // carries no meta after a path-matched `start()`), so `getTransitionPath`
    // takes FAST PATH 3 and (de)activates the WHOLE chain incl. shared ancestors
    // → false-negative ("Link disabled though the click would succeed").
    // `normalizeParams` also aligns the params guards observe with navigate's.
    // `skipFreeze` (5th arg) mirrors the navigate guard phase, where guards see
    // an unfrozen, transition-less `toState` (freeze happens later in
    // `completeTransition`).
    //
    // A capability predicate must answer, not throw: if the target path can't be
    // built from these params (e.g. a required path param is missing), the route
    // is simply unreachable with this input — return `false` rather than letting
    // `buildPath` throw (#725).
    let toState: State;

    try {
      const normalizedParams = normalizeParams(resolvedParams);
      const meta = this.#routes.getMetaForState(resolvedName);
      const path = ctx.buildPath(resolvedName, normalizedParams);

      toState = this.#state.makeState(
        resolvedName,
        normalizedParams,
        path,
        meta,
        true,
      );
    } catch {
      return false;
    }

    const fromState = this.#state.get();

    const { toDeactivate, toActivate } = getTransitionPath(toState, fromState);

    return this.#routeLifecycle.canNavigateTo(
      toDeactivate,
      toActivate,
      toState,
      fromState,
    );
  }

  // ============================================================================
  // Plugins
  // ============================================================================

  usePlugin(
    ...plugins: (PluginFactory<Dependencies> | false | null | undefined)[]
  ): Unsubscribe {
    // Post-dispose guard, mirroring #946 for subscribe/subscribeLeave. A
    // reference captured before dispose() (`const up = router.usePlugin`)
    // bypasses the #markDisposed method swap, so the swap alone is not enough:
    // without this, the factory would run on a disposed router (real side
    // effects), listeners would land in the cleared emitter, and teardown would
    // never fire — a silent zombie plugin (#1196).
    if (this.#eventBus.isDisposed()) {
      throw new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    const filtered = plugins.filter(Boolean) as PluginFactory<Dependencies>[];

    if (filtered.length === 0) {
      return () => {};
    }

    const ctx = getInternals(this);

    ctx.validator?.plugins.validatePluginLimit(
      this.#plugins.count(),
      this.#limits,
    );
    for (const plugin of filtered) {
      // `getAll()` sits inside the optional-chain argument on purpose: with no
      // validator installed (production default) the `?.` short-circuits and the
      // array is never allocated. Hoisting it out would either allocate on the
      // no-validator hot path or push the dev-only branch out of coverage.
      ctx.validator?.plugins.validateNoDuplicatePlugins(
        plugin,
        this.#plugins.getAll(),
      );
    }

    return this.#plugins.use(...filtered);
  }

  // ============================================================================
  // Subscription (backed by EventEmitter)
  // ============================================================================

  subscribe(listener: SubscribeFn): Unsubscribe {
    EventBusNamespace.validateSubscribeListener(listener);

    return this.#eventBus.subscribe(listener);
  }

  subscribeLeave(listener: LeaveFn): Unsubscribe {
    EventBusNamespace.validateSubscribeLeaveListener(listener);

    return this.#eventBus.subscribeLeave(listener);
  }

  isLeaveApproved(): boolean {
    return this.#eventBus.isLeaveApproved();
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  navigate(
    routeName: string,
    routeParams?: Params,
    options?: NavigationOptions,
  ): Promise<State> {
    this.#assertNotReentrant();

    const ctx = getInternals(this);

    ctx.validator?.navigation.validateNavigateArgs(routeName);
    ctx.validator?.navigation.validateParams(routeParams, "navigate");

    const opts = options ?? EMPTY_OPTS;

    ctx.validator?.navigation.validateNavigationOptions(opts, "navigate");

    const promiseState = this.#navigation.navigate(
      routeName,
      routeParams ?? EMPTY_PARAMS,
      opts,
    );

    if (this.#navigation.lastSyncResolved) {
      this.#navigation.lastSyncResolved = false;
    } else if (this.#navigation.lastSyncRejected) {
      // Cached rejection — already pre-suppressed at module load, skip .catch()
      this.#navigation.lastSyncRejected = false;
    } else {
      Router.#suppressUnhandledRejection(promiseState);
    }

    return promiseState;
  }

  navigateToDefault(options?: NavigationOptions): Promise<State> {
    this.#assertNotReentrant();

    const ctx = getInternals(this);

    ctx.validator?.navigation.validateNavigateToDefaultArgs(options);

    const opts = options ?? EMPTY_OPTS;

    ctx.validator?.navigation.validateNavigationOptions(
      opts,
      "navigateToDefault",
    );

    const promiseState = this.#navigation.navigateToDefault(opts);

    if (this.#navigation.lastSyncResolved) {
      this.#navigation.lastSyncResolved = false;
    } else if (this.#navigation.lastSyncRejected) {
      this.#navigation.lastSyncRejected = false;
    } else {
      Router.#suppressUnhandledRejection(promiseState);
    }

    return promiseState;
  }

  navigateToNotFound(path?: string): State {
    this.#assertNotReentrant();

    if (!this.#eventBus.isActive()) {
      throw new RouterError(errorCodes.ROUTER_NOT_STARTED);
    }

    if (path !== undefined && typeof path !== "string") {
      throw new TypeError(
        `[router.navigateToNotFound] path must be a string, got ${typeof path}`,
      );
    }

    if (path !== undefined) {
      return this.#navigation.navigateToNotFound(path);
    }

    // #1172: a path-less call derives the default path from the committed state.
    // During the two-phase start window the router is active (`isActive()` true)
    // while `getState()` is still undefined, so throw an actionable RouterError
    // instead of a cryptic `TypeError` from dereferencing the absent state —
    // same class as the #939 always-on invariant guards.
    const current = this.#state.get();

    if (current === undefined) {
      throw new RouterError(errorCodes.ROUTER_NOT_STARTED, {
        message:
          "[router.navigateToNotFound] cannot derive the path before the start navigation commits — pass an explicit path",
      });
    }

    return this.#navigation.navigateToNotFound(current.path);
  }

  /**
   * Classifies a fire-and-forget rejection as an EXPECTED outcome that must
   * stay silent (no log). Shared by the navigate and start suppressors so the
   * suppression contract lives in one place.
   *
   * A suppressed RouterError code is a normal caller-owned navigation result
   * (a guard block, SAME_STATES, ROUTER_NOT_STARTED, …) — see
   * SUPPRESSED_ERROR_CODES (#721).
   *
   * The #945 RecursionDepthError carve-out is gone: a reentrant navigate() from a
   * listener can no longer self-feed — it throws REENTRANT_NAVIGATION
   * synchronously at the facade (RFC navigation-cancellation-unification §4), so
   * navigate()'s promise never rejects with a recursion error (re-entrant emits
   * are coalesced at the emitter, #1033; reentrant route-CRUD throws
   * REENTRANT_TREE_MUTATION to the CRUD caller, #1032 — not through a navigate
   * promise).
   */
  static #isExpectedRejection(error: unknown): boolean {
    return (
      error instanceof RouterError && SUPPRESSED_ERROR_CODES.has(error.code)
    );
  }

  /**
   * Pre-allocated suppressor for navigate / navigateToDefault / navigateToState.
   * Avoids creating a new closure on every navigate() call.
   *
   * The log line IS reachable (contrary to the pre-#931 "unreachable" comment):
   * a subscribeLeave listener that throws (sync or async) rejects navigate()
   * with the original NON-suppressed error — not re-coded to TRANSITION_CANCELLED
   * — and a Symbol path-param's stringify TypeError is likewise non-suppressed.
   * Both surface here under "router.navigate". Tested in guard-block-suppression
   * (negative) and the positive case below.
   */
  static readonly #onSuppressedNavigateError = (error: unknown): void => {
    if (Router.#isExpectedRejection(error)) {
      return;
    }

    logger.error("router.navigate", "Unexpected navigation error", error);
  };

  /**
   * Pre-allocated suppressor for start(). Its failures must surface under their
   * own "router.start" category rather than being misattributed to
   * "router.navigate" (#931). The log line is reachable: a start interceptor
   * that throws a plain Error after next() committed (the SSR/RSC loader window,
   * #763) — or a cryptic path TypeError — is not a suppressed RouterError.
   */
  static readonly #onSuppressedStartError = (error: unknown): void => {
    if (Router.#isExpectedRejection(error)) {
      return;
    }

    logger.error("router.start", "Unexpected start error", error);
  };

  /**
   * Fire-and-forget safety: prevents unhandled rejection warnings when
   * navigate/navigateToDefault/start is called without await. Expected errors
   * are silently suppressed; unexpected ones are logged under `onSuppressed`'s
   * category — navigate by default; start() passes #onSuppressedStartError so
   * its failures are logged as "router.start", not "router.navigate" (#931).
   */
  static #suppressUnhandledRejection(
    promise: Promise<State>,
    onSuppressed: (error: unknown) => void = Router.#onSuppressedNavigateError,
  ): void {
    promise.catch(onSuppressed);
  }

  /**
   * Rejects a synchronous reentrant navigation — `navigate` /
   * `navigateToDefault` / `navigateToState` / `navigateToNotFound` called from
   * inside a transition-event listener while a transition is being dispatched
   * (RFC navigation-cancellation-unification §4). Throws synchronously: inside a
   * listener the emit's `onListenerError` isolation surfaces it (visible,
   * non-fatal); a DEFERRED (async / microtask) navigate from a listener runs
   * after dispatch settles and is allowed. Always-on core invariant guard (not
   * validator-gated).
   */
  #assertNotReentrant(): void {
    if (this.#eventBus.isProcessing()) {
      throw new RouterError(errorCodes.REENTRANT_NAVIGATION);
    }
  }

  /**
   * Settles the FSM after a failed start pipeline, then re-throws so the
   * rejection still surfaces to the caller. Three cases, by what the pipeline
   * reached before throwing:
   *
   * - **Pre-commit, READY** (`isReady()` and no committed state): an interceptor
   *   threw after `completeStart()` reached READY but before any state committed
   *   (e.g. an activation guard blocked the start navigation) — return READY →
   *   IDLE via `stop()` so the router is reusable.
   * - **Pre-commit, STARTING** (`isStarting()`): the pipeline threw before
   *   `completeStart()` — a sync interceptor throw before `next()`, or a throw
   *   inside the namespace before commit — so unwind STARTING → IDLE via
   *   `sendFail`, which also emits TRANSITION_ERROR from STARTING (#668).
   * - **Post-commit, READY with committed state** (neither branch fires): a
   *   loader/interceptor threw AFTER `navigateToState` committed and emitted
   *   TRANSITION_SUCCESS (the SSR/RSC loader window). Keep the committed state —
   *   rolling back would retract an observed success ("phantom success", #763);
   *   the error still surfaces via the re-throw.
   */
  #unwindFailedStart(error: unknown): never {
    if (this.#eventBus.isReady() && this.#state.get() === undefined) {
      this.#lifecycle.stop();
      this.#eventBus.sendStop();
    } else if (this.#eventBus.isStarting()) {
      this.#eventBus.sendFail(undefined, undefined, error);
    }

    throw error;
  }

  #markDisposed(): void {
    this.navigate = throwDisposed;
    this.navigateToDefault = throwDisposed;
    this.navigateToNotFound = throwDisposed;
    this.start = throwDisposed;
    this.stop = throwDisposed;
    this.usePlugin = throwDisposed;

    this.subscribe = throwDisposed;
    this.subscribeLeave = throwDisposed;
    this.canNavigateTo = throwDisposed;
  }
}

function throwDisposed(): never {
  throw new RouterError(errorCodes.ROUTER_DISPOSED);
}

/**
 * Derives CreateMatcherOptions from router Options.
 * Maps core option names to matcher option names.
 */
function deriveMatcherOptions(
  options: Readonly<Options>,
): CreateMatcherOptions {
  return {
    strictTrailingSlash: options.trailingSlash === "strict",
    caseSensitive: options.caseSensitive,
    strictQueryParams: options.queryParamsMode === "strict",
    urlParamsEncoding: options.urlParamsEncoding,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    queryParams: options.queryParams!,
  };
}
