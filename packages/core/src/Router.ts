// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { assertChannelCorrect, findMisChanneledKey } from "./channels";
import { EMPTY_PARAMS, errorCodes } from "./constants";
import {
  assertLoggerConfig,
  guardDependencies,
  guardRouteStructure,
} from "./guards";
import { normalizeParams } from "./helpers";
import {
  createInterceptable,
  createTernaryInterceptable,
  getInternals,
  registerInternals,
  throwOnMisChanneledKey,
} from "./internals";
import { createLimits } from "./limits";
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
import { isExpectedRejection } from "./namespaces/NavigationNamespace/constants";
import { CACHED_ALREADY_STARTED_ERROR } from "./namespaces/RouterLifecycleNamespace/constants";
import { buildURL, canonicalize, materialize } from "./pipeline";
import { RouterError } from "./RouterError";
import { createRouterFSM } from "./routerFSM";
import { getTransitionPath } from "./transitionPath";
import { EventEmitter } from "./utils/event-emitter";
import { RouterLogger } from "./utils/logger";
import { wireNamespaces } from "./wiring";

import type { CreateMatcherOptions } from "./engine";
import type { RouterInternals } from "./internals";
import type { DependenciesStore } from "./namespaces";
import type {
  DefaultDependencies,
  LeaveFn,
  NavigationOptions,
  NavigationTarget,
  Options,
  Params,
  Router as RouterInterface,
  SearchParams,
  State,
  SubscribeFn,
  Unsubscribe,
  PluginFactory,
  Route,
} from "./types";
import type { Limits, RouterEventMap } from "./types/internal";

const EMPTY_OPTS: Readonly<NavigationOptions> = Object.freeze({});

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

  readonly #options: OptionsNamespace<Dependencies>;
  readonly #limits: Limits;
  readonly #dependenciesStore: DependenciesStore<Dependencies>;
  readonly #state: StateNamespace;
  readonly #routes: RoutesNamespace<Dependencies>;
  readonly #routeLifecycle: RouteLifecycleNamespace<Dependencies>;
  readonly #plugins: PluginsNamespace<Dependencies>;
  readonly #navigation: NavigationNamespace;
  readonly #lifecycle: RouterLifecycleNamespace;

  readonly #eventBus: EventBusNamespace;

  /**
   * Per-instance suppressor for fire-and-forget `start()`. It logs through THIS
   * router's logger (built in the constructor), so it cannot be static (#724).
   *
   * Only start, since Step 0: the navigate/navigateToState/navigateToDefault
   * suppressor moved to `NavigationNamespace`, which is where those promises are
   * created and therefore the only layer that knows which of them are already
   * pre-suppressed. Start keeps its own because it suppresses a promise the
   * FACADE builds (`internalStart.catch(#unwindFailedStart)`), and because the
   * #931 category split survives — start failures log under "router.start" (a
   * start interceptor throwing a plain Error after next() committed, #763, or a
   * cryptic path TypeError — neither a suppressed RouterError). Both sides still
   * classify through ONE shared policy, `isExpectedRejection`.
   */
  readonly #onSuppressedStartError: (error: unknown) => void;

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
    options: Partial<Options<Dependencies>> = {},
    dependencies: Dependencies = {} as Dependencies,
  ) {
    // Extract the logger config WITHOUT mutating the caller's `options` object
    // (#724). `routerOptions` is the logger-stripped view handed to the options
    // pipeline so `logger` never lands in the frozen router options.
    const { logger: loggerConfig, ...routerOptions } = options;

    if (loggerConfig) {
      assertLoggerConfig(loggerConfig);
    }

    // Per-router logger instance — replaces the former process-global singleton
    // whose configure() leaked across every router in the process, last
    // createRouter winning (#724). Stored on ctx (registerInternals below), so
    // the facade reads getInternals(this).logger; namespaces receive it via
    // their deps at wiring; plugins reach it through getPluginApi(router).logger.
    const logger = new RouterLogger(loggerConfig);

    // Per-instance fire-and-forget suppressor (see the field declaration): it
    // logs through THIS router's logger, so it is built here, not static.
    this.#onSuppressedStartError = (error: unknown): void => {
      if (isExpectedRejection(error)) {
        return;
      }

      logger.error("router.start", "Unexpected start error", error);
    };

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
      logger,
    );
    this.#routeLifecycle = new RouteLifecycleNamespace<Dependencies>();
    this.#plugins = new PluginsNamespace<Dependencies>();
    this.#navigation = new NavigationNamespace();
    this.#lifecycle = new RouterLifecycleNamespace();

    // =========================================================================
    // Initialize EventBus
    // =========================================================================

    const routerFSM = createRouterFSM();

    // The state service reads the machine's context from here on — the cells
    // themselves live there (plan §11.A2). Assigned before anything can read
    // state: the namespaces are still being constructed.
    this.#state.setContext(routerFSM.getContext());

    const emitter = new EventEmitter<RouterEventMap>({
      // Shared per-listener error sink: EventEmitter reports synchronous listener
      // throws here, and EventBusNamespace.subscribe routes an async listener's
      // rejected Promise through the SAME sink (#944) — both land in one place.
      onListenerError: (eventName, error) => {
        logger.error("Router", `Error in listener for ${eventName}:`, error);
      },
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
      // The FSM SYSTEM_COMMIT action writes the state through this effect, so
      // the 404 bypass and `replace()`'s revalidation stop writing it
      // themselves — "no commit outside the table".
      commitState: (state) => {
        this.#state.set(state);
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

    // THE single forwardState boundary (#1548/#1549). The interceptable resolves
    // the route (forwardTo) and runs the whole interceptor chain — a plugin
    // injecting params, a search-schema validation, etc. The outer layer then
    // CHECKS the channels once, keyed on the RESOLVED route's `?`-declaration.
    //
    // It used to REPAIR them instead (`separateChannels`, stage ②): a declared
    // query key left in the params bag was moved into the query channel behind
    // the producer's back. Three things were wrong with that. The producer kept
    // believing the bag it wrote was the one that shipped. A plugin could
    // inject past a validation that had already run — search-schema documented
    // exactly that leak, with a test named LEAKS. And the caller's own
    // mis-channelled key and a chain default's query half landed in DIFFERENT
    // channels, where no merge ranks them, so the default silently won (#1570).
    // Refusing is the whole fix: whoever names the route knows its declaration.
    //
    // `as unknown as` is required: the closure is non-generic, but
    // RouterInternals["forwardState"] is declared generic `<P, S>`, which tsc
    // will not infer from a non-generic source (Sonar S4325 misclassifies this
    // as a redundant cast).
    const rawForwardState = createTernaryInterceptable(
      "forwardState",
      (name: string, params: Params, search?: SearchParams) =>
        this.#routes.forwardState(name, params, search),
      interceptorsMap,
    );

    const forwardState = ((
      name: string,
      params: Params,
      search?: SearchParams,
    ) => {
      const forwarded = rawForwardState(name, params, search);

      // The DECLARATION that matters is the RESOLVED route's — it owns the URL
      // that gets printed. When a chain resolved to a different route, say so:
      // a caller who wrote `navigate("src", { lang })` looked at `src`'s config,
      // where `lang` is undeclared and legitimate, and needs to be told that the
      // hop landed somewhere that spells it `?lang`. Naming only the target
      // would read as a message about a route they never mentioned.
      assertChannelCorrect(
        "forwardState",
        forwarded.name,
        forwarded.params,
        this.#routes.getQueryParams(forwarded.name),
        () =>
          forwarded.name === name
            ? "the `params` bag leaving the forwardState chain"
            : `the \`params\` bag leaving the forwardState chain (forwarded here from "${name}")`,
      );

      return {
        name: forwarded.name,
        // The type says `params: P`, and across THIS boundary the type is a
        // contract, not a guarantee: `rawForwardState` is an interceptable, so
        // the value has passed through user code that can spread a partial
        // result. The net used to be reached by stage ②'s split (an all-query
        // bag left the path half undefined) and is now reached only by that
        // contract violation — still worth surviving rather than putting
        // `undefined` into `state.params`. Pinned by "normalises a params bag an
        // interceptor dropped to `undefined`" in forwardState.test.ts, which
        // fails if this is removed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above: the declared type cannot model an interceptor's runtime return
        params: forwarded.params ?? EMPTY_PARAMS,
        search: forwarded.search,
      };
    }) as unknown as RouterInternals["forwardState"];

    registerInternals(this, {
      logger,
      makeState: (name, params, search, path) =>
        this.#state.makeState(name, params, search, path),
      getMetaForState: (name) => this.#routes.getMetaForState(name),
      getQueryParams: (name) => this.#routes.getQueryParams(name),
      forwardState,
      buildStateResolved: (name, params) =>
        this.#routes.buildStateResolved(name, params),
      port: () => this.#routes.getPort(),
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
      buildPath: createTernaryInterceptable(
        "buildPath",
        (route: string, params?: Params, search?: SearchParams) =>
          this.#routes.buildPath(
            route,
            params ?? EMPTY_PARAMS,
            search,
            this.#options.get(),
          ),
        interceptorsMap,
      ),
      emitTransitionError: (error) => {
        this.#eventBus.sendFailSafe(undefined, this.#state.get(), error);
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
        // Plugin-only navigation primitive (#525). Fire-and-forget safe like the
        // public facade methods — popstate handlers call it without awaiting —
        // but the safety now belongs to the namespace that creates the promise,
        // so this closure only owes callers the Promise shape.
        this.#assertNotReentrant();

        return Router.#asPromise(
          this.#navigation.navigateToState(state, navOpts ?? EMPTY_OPTS),
        );
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
        // `logger` is a const in this constructor's scope (a RouterLogger class
        // instance), so getConfig() yields the resolved config a clone inherits
        // — frozen options don't carry `logger`, so cloneRouter reads it here.
        loggerConfig: logger.getConfig(),
      }),
      routeGetStore: () => this.#routes.getStore(),
      // Cross-namespace state (issue #174)
      getStateName: () => this.#state.get()?.name,
      isTransitioning: () => this.#eventBus.isTransitioning(),
      systemCommit: (toState, fromState, opts) => {
        this.#eventBus.systemCommit({ toState, fromState, opts });
      },
      clearState: () => {
        this.#state.set(undefined);
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
    search?: SearchParams,
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
      getInternals(this).logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. Root node is not considered a parent of any route.',
      );

      return false;
    }

    // Slot-shift (RFC-4 M2 / #1548): `search` is the explicit query channel at
    // position 3; `strictEquality` / `ignoreQueryParams` shift to 4 / 5.
    return this.#routes.isActiveRoute(
      name,
      params,
      search,
      strictEquality,
      ignoreQueryParams,
    );
  }

  buildPath(route: string, params?: Params, search?: SearchParams): string {
    const ctx = getInternals(this);

    ctx.validator?.routes.validateBuildPathArgs(route);
    ctx.validator?.navigation.validateParams(params, "buildPath");

    // `search` (RFC-4 M2 / #1548) is the explicit query channel; the matcher
    // builds the query string from it and the path from `params`, resolving a
    // colliding name (`/items/:id?id`). Omitted → the v1 single-bag path.
    return ctx.buildPath(route, normalizeParams(params), search);
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

    return RoutesNamespace.shouldUpdateNode(nodeName, (name) =>
      this.#routes.getMetaForState(name),
    );
  }

  // ============================================================================
  // Router Lifecycle
  // ============================================================================

  isActive(): boolean {
    return this.#eventBus.isActive();
  }

  /**
   * ONE fire-and-forget checkpoint for `start()`, deliberately — the same shape
   * `NavigationNamespace.#settle` gives the navigate family, and for the same
   * reason: a `.catch()` remembered at each `return` site is a thing that can be
   * forgotten, and a forgotten one is invisible until it leaks.
   *
   * It HAD been forgotten (#1605). The `ALREADY_STARTED` rejection left through
   * an early `return` above the suppressor, so a second, unawaited `start()`
   * raised an `unhandledRejection` — process-fatal under Node 22+'s default
   * `--unhandled-rejections=throw`, with a stack pointing at the cached error's
   * module constant rather than at the caller. Every return site now leaves
   * through `#runStart`, so no future early return can reopen it.
   */
  start(startPath: string): Promise<State> {
    const promiseState = this.#runStart(startPath);

    promiseState.catch(this.#onSuppressedStartError);

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

  canNavigateTo(name: string, params?: Params, search?: SearchParams): boolean {
    const ctx = getInternals(this);

    ctx.validator?.routes.validateRouteName(name, "canNavigateTo");
    ctx.validator?.navigation.validateParams(params, "canNavigateTo");

    if (!this.#routes.hasRoute(name)) {
      return false;
    }

    // Mirror EVERY way `navigate` refuses these same arguments, not only the
    // guard verdict (#1576). A declared query key handed in the PATH bag makes
    // `navigate` throw synchronously at the facade (channel guard P1, #1572), so
    // the route is unreachable with this input — exactly the situation invariant
    // canNavigateTo #5 already answers `false` to for an unbuildable path (#725).
    // Answering `true` here promised a navigation that throws on the click.
    //
    // The RAW caller bag, before `forwardState`: the same argument, the same
    // registry and the same name P1 reads, so the predicate cannot be stricter
    // OR laxer than the verb. The `/items/:id?id` collision is absent from
    // `queryNames` by construction (#843 / #1549), so it stays navigable in both.
    //
    // A `false` rather than a rethrow: a capability predicate answers, it never
    // throws (#725), and it runs on every `<Link>` render across six adapters —
    // which is exactly why P1 does not instrument the predicates (#1572).
    if (
      findMisChanneledKey(params, this.#routes.getQueryParams(name)) !==
      undefined
    ) {
      return false;
    }

    // Resolution runs USER code and must not escape as an exception (#1577):
    // a dynamic `forwardTo` callback, a plugin's `forwardState` interceptor, and
    // the caller's own bag (the merge walks it key by key, so an accessor-backed
    // key throws here — the channel guard itself does NOT, it catches its own
    // read) all sit on this one call. The
    // predicate is documented TOTAL — it answers, it never throws (INVARIANTS
    // canNavigateTo #5, #725) — and its sibling `isActiveRoute` has wrapped the
    // very same primitive since #1573 (`RoutesNamespace.ts:631-645`). Leaving
    // this one bare made the two render-path predicates disagree about what a
    // throwing resolution means.
    //
    // A separate `try` rather than widening the one below: that one is SILENT by
    // design (an unbuildable path is a normal "unreachable with this input"
    // answer, #725), while user code crashing is an operational fault that must
    // never vanish — the same split #959 draws for a throwing guard.
    // Stages ① + ③ + the mode gate, one pass through the pipeline (nav-pipeline
    // Phase 2, step 2-3). `canonicalize` reaches the same `forwardState` seam
    // this method used to call directly (`port.resolveForward` IS
    // `ctx.forwardState`), so the resolution, the interceptor zone and the
    // channel CHECK on the seam are all unchanged — what the pipeline
    // replaces is the hand-rolled composition that followed.
    // Read ONCE (#1589): this predicate reached for the port twice — here and
    // again for `buildURL` below — on every `<Link>` render. The port is one
    // object per router, created at wiring time, so the second read could only
    // ever return the same reference.
    const port = this.#routes.getPort();

    let canonical;

    try {
      canonical = canonicalize(
        port,
        name,
        // The singleton, not a fresh `{}` (#1589): this predicate runs on every
        // `<Link>` render too, and `normalizeParams` recognises `EMPTY_PARAMS` by
        // identity — a literal makes it walk and re-allocate instead.
        params ?? EMPTY_PARAMS,
        search,
      );
    } catch (error) {
      ctx.logger.warn(
        "router.canNavigateTo",
        `Resolving route "${name}" threw while answering the predicate; treating the route as unreachable.`,
        error,
      );

      return false;
    }

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
      // ⑤a then ⑤b. `buildURL` is usable HERE (unlike in `buildPath` itself,
      // where it would recurse through the interceptable `ctx.buildPath` that
      // wraps that very method): this point is not the one the port prints
      // through, so the URL is built by the pipeline and the state materialised
      // from the SAME canonical intent — `toState.search` and `toState.path`
      // cannot drift. `skipFreeze` mirrors the navigate guard phase, where
      // guards see an unfrozen, transition-less `toState`.
      toState = materialize(canonical, {
        path: buildURL(canonical, port),
        skipFreeze: true,
      });
    } catch {
      return false;
    }

    const fromState = this.#state.get();

    const { toDeactivate, toActivate } = getTransitionPath(
      toState,
      fromState,
      (routeName) => this.#routes.getMetaForState(routeName),
    );

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
    target: NavigationTarget,
    options?: NavigationOptions,
  ): Promise<State>;
  navigate(
    routeName: string,
    routeParams?: Params,
    routeSearch?: SearchParams,
    options?: NavigationOptions,
  ): Promise<State>;
  navigate(
    nameOrTarget: string | NavigationTarget,
    paramsOrOptions?: Params | NavigationOptions,
    routeSearch?: SearchParams,
    options?: NavigationOptions,
  ): Promise<State> {
    this.#assertNotReentrant();

    const ctx = getInternals(this);

    // Two equal-standing forms (RFC-4 M2 / #1548): the descriptor
    // `navigate(target, opts)` (opts at position 2) and the positional
    // `navigate(name, params, search, opts)` (opts at position 4). The v1
    // `navigate(name, params, opts)` form is gone — its position-3 opts is now
    // the `search` slot; unpack whichever form the caller used into one path.
    let routeName: string;
    let routeParams: Params | undefined;
    let search: SearchParams | undefined;
    let opts: NavigationOptions;

    // The static type excludes null, but `navigate(null)` is a real runtime
    // misuse that must stay graceful (ROUTE_NOT_FOUND, not a crash on
    // `null.name`) — the null check routes it to the positional branch.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime null guard for navigate(null)
    if (typeof nameOrTarget === "object" && nameOrTarget !== null) {
      routeName = nameOrTarget.name;
      routeParams = nameOrTarget.params;
      search = nameOrTarget.search;
      opts = (paramsOrOptions as NavigationOptions | undefined) ?? EMPTY_OPTS;
    } else {
      routeName = nameOrTarget;
      routeParams = paramsOrOptions as Params | undefined;
      search = routeSearch;
      opts = options ?? EMPTY_OPTS;
    }

    throwOnMisChanneledKey(ctx, "navigate", routeName, routeParams);

    ctx.validator?.navigation.validateNavigateArgs(routeName);
    ctx.validator?.navigation.validateParams(routeParams, "navigate");
    ctx.validator?.navigation.validateNavigationOptions(opts, "navigate");

    return Router.#asPromise(
      this.#navigation.navigate(
        routeName,
        routeParams ?? EMPTY_PARAMS,
        search,
        opts,
      ),
    );
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

    return Router.#asPromise(this.#navigation.navigateToDefault(opts));
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
   * Hands the namespace's result back as the `Promise<State>` the public API
   * owes, and does nothing else.
   *
   * A non-Promise means the navigation already settled synchronously — the
   * return TYPE says so, which is what retired `lastSyncResolved`. Suppression is
   * not the facade's business any more: the namespace attaches it where the
   * promise is created, the only layer that can tell a fresh rejection from one
   * of its own pre-suppressed singletons.
   *
   * The Promise wrap is not a new cost — the namespace used to allocate exactly
   * this one and return it.
   */
  static #asPromise(result: State | Promise<State>): Promise<State> {
    return result instanceof Promise ? result : Promise.resolve(result);
  }

  #runStart(startPath: string): Promise<State> {
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

    return internalStart.catch((error: unknown) =>
      this.#unwindFailedStart(error),
    );
  }

  /**
   * Rejects a synchronous reentrant navigation — `navigate` /
   * `navigateToDefault` / `navigateToState` / `navigateToNotFound` called from
   * inside a navigation core has not finished with. Throws synchronously: inside
   * a listener the emit's `onListenerError` isolation surfaces it (visible,
   * non-fatal); a DEFERRED (async / microtask) navigate runs after the window
   * closes and is allowed. Always-on core invariant guard (not validator-gated).
   *
   * TWO windows, because application code runs in two places core does not
   * control, on opposite sides of the announce:
   *
   * - **Dispatch** (`isProcessing`) — a transition-event listener, mid-emit
   *   (RFC navigation-cancellation-unification §4).
   * - **Pre-start** (`isPreparing`, #1610) — a `forwardState` / `buildPath`
   *   interceptor or a route codec, BEFORE the first emit. The dispatch depth
   *   cannot see it: there has been no emit yet, which is exactly how a nested
   *   `navigate()` used to run to completion here, commit a phantom
   *   `TRANSITION_SUCCESS`, and shift the outer transition's `fromState`.
   *
   * A guard is deliberately NOT either of them: it runs after the announce, so
   * the classic guard-redirect (`navigate(...)` then `return false`) stays a
   * plain supersede.
   */
  #assertNotReentrant(): void {
    if (this.#eventBus.isProcessing() || this.#navigation.isPreparing()) {
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
function deriveMatcherOptions<Dependencies extends DefaultDependencies>(
  options: Readonly<Options<Dependencies>>,
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
