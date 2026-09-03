// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { assertChannelCorrect, findMisChanneledKey } from "./channels";
import { EMPTY_OPTS, EMPTY_PARAMS, errorCodes } from "./constants";
import {
  assertLoggerConfig,
  guardDependencyShape,
  guardRouteStructure,
} from "./guards";
import { dropUnsafeKey, withoutUnsafeKey } from "./helpers";
import {
  createInterceptable,
  createTernaryInterceptable,
  getInternals,
  registerInternals,
  SEAM,
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
import { buildURL, canonicalize, materializePending } from "./pipeline";
import { RouterError, freezeThrownError } from "./RouterError";
import { createRouterFSM } from "./routerFSM";
import { getTransitionPath } from "./transitionPath";
import { EventEmitter } from "./utils/event-emitter";
import { RouterLogger } from "./utils/logger";
import { wireNamespaces } from "./wiring";

import type { CreateMatcherOptions, QueryParamsConfig } from "./engine";
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

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2072). */
const objectCreate = Object.create;

/**
 * Captured at module load, the discipline `cloneRouter`, `helpers` and `guards`
 * already follow. Both DECIDE something a shim could take over: `objectKeys`
 * picks which limits a clone inherits, and `freeze` is what makes that key set
 * safe to hand out by reference — a no-op shim of either leaves the base and its
 * clones free to disagree.
 */
const objectKeys = Object.keys;
const freeze = Object.freeze;

/**
 * Router class with integrated namespace architecture.
 *
 * All functionality is provided by namespace classes:
 * - OptionsNamespace: getOptions (immutable)
 * - DependenciesStore: get/set/remove dependencies
 * - EventEmitter: subscribe
 * - StateNamespace: state SERVICE (makeState, areStatesEqual); the committed
 *   pair itself lives in the FSM context (#1641)
 * - RoutesNamespace: route tree operations
 * - RouteLifecycleNamespace: canActivate/canDeactivate guards
 * - PluginsNamespace: plugin lifecycle
 * - NavigationNamespace: navigate
 * - RouterLifecycleNamespace: start (stop/dispose are FSM edges, not methods)
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
  /** The limit names the CALLER passed, snapshotted at construction (#1961). */
  readonly #limitKeys: readonly string[] | undefined;
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

  /**
   * The href door's own run of the `forwardState` chain, above the route-default
   * merge (#2087).
   */
  readonly #buildPathIntent: (
    route: string,
    params: Params,
    search: SearchParams | undefined,
  ) => string;

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

    // ⚑ The guard RETURNS core's own copy, and the logger is built from that
    // (#1814 / #1842). One reader: nothing downstream re-reads the caller's bag,
    // so no two readers can disagree about own-ness.
    const normalizedLogger = loggerConfig
      ? assertLoggerConfig(loggerConfig)
      : undefined;

    // Per-router logger instance — replaces the former process-global singleton
    // whose configure() leaked across every router in the process, last
    // createRouter winning (#724). Stored on ctx (registerInternals below), so
    // the facade reads getInternals(this).logger; namespaces receive it via
    // their deps at wiring; plugins reach it through getPluginApi(router).logger.
    const logger = new RouterLogger(normalizedLogger);

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

    // Unconditional guard-level validation before creating namespaces.
    // ⚑ SHAPE only — the getter ban rides the store's copy walk (#1861), so a
    // dependency bag is enumerated ONCE per router instead of twice. This half
    // walks nothing, so it stays here, above `guardRouteStructure`, and keeps
    // "is this even an object" as the first thing a caller hears about.
    guardDependencyShape(dependencies);

    // Stryker disable next-line EqualityOperator: equivalent — `>= 0` is always true, but `guardRouteStructure([])` on an empty array is a no-op, so validating an empty list behaves identically to skipping it. (ConditionalExpression stays live: `→false` skips validation of a real route list and is killable.)
    if (routes.length > 0) {
      guardRouteStructure(routes);
    }

    // =========================================================================
    // Create Namespaces
    // =========================================================================

    this.#options = new OptionsNamespace(routerOptions);
    this.#limits = createLimits(routerOptions.limits);
    // ⚑ The key set, snapshotted HERE, beside the values (#1961). `createLimits`
    // owns what each limit IS; this owns which ones the caller NAMED, and a
    // clone needs both. Read once, at construction, for the same reason the
    // values are: `routerOptions.limits` is the caller's object and stays
    // theirs.
    //
    // ⚠ `objectKeys`, matching `createLimits`' SPREAD, not `Object.hasOwn` over
    // the five known names. The spread skips a non-enumerable own key, so the
    // base does not see one — and a snapshot that did would make the clone
    // stricter than its base. Pinned by "a non-enumerable own limit is invisible
    // to the base AND to the clone".
    //
    // ⚠ FROZEN, for the reason its sibling `#limits` is (#1880): `getCloneState`
    // hands this out BY REFERENCE, so a consumer holding it could move what the
    // clone inherits while the base kept what its emitter was wired with —
    // measured on the unfrozen form, emptying it gave the base cap 50 and the
    // clone none, and pushing a name onto it made the clone report a
    // materialised default the base never had. That is #1961's own divergence,
    // reintroduced through the slot that fixes it.
    this.#limitKeys =
      routerOptions.limits == null
        ? undefined
        : freeze(objectKeys(routerOptions.limits));
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

    // ⚑ No `abortController` effect to inject any more (#1684): the FSM CANCEL
    // action reads the controller off the navigation it is already carrying
    // (`ctx.inflight.controller`), so the wire from here to
    // `NavigationNamespace` — and the router-level slot it fed — are both gone.
    this.#eventBus = new EventBusNamespace({ routerFSM, emitter });

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
    // It REFUSES rather than repairs, and three things are why no repair may be
    // re-introduced (#1570). Moving a declared query key out of the params bag
    // leaves the producer believing the bag it wrote is the one that ships. It
    // lets a plugin inject past a validation that has already run — the leak
    // search-schema names. And the caller's own mis-channelled key and a chain
    // default's query half land in DIFFERENT channels, where no merge ranks
    // them, so the default silently wins. Whoever names the route knows its
    // declaration.
    //
    // `as unknown as` is required: the closure is non-generic, but
    // RouterInternals["forwardState"] is declared generic `<P, S>`, which tsc
    // will not infer from a non-generic source (Sonar S4325 misclassifies this
    // as a redundant cast).
    // ⚑ What every `next()` in the chain hands back (#1986). The door's own
    // answer is the exit copy's business, below; this is the boundary BETWEEN
    // links, which nothing else sees — `original` into the first interceptor,
    // and each interceptor into the one outside it. It is what stops a plugin
    // merging `next()`'s result from swapping its own object's prototype, and it
    // is the only cover for a plugin poisoning the one outside it.
    //
    // ⚠ Not on the ARGUMENTS: the chain fold
    // (`RoutesNamespace.#layerChainDefaults`) merges the caller's bag INSIDE the
    // call, and `mergeDefined`'s own `UNSAFE_KEY` skip depends on that. Cleaning
    // the arguments takes that branch's only live input away — measured, the
    // skip fires once per CHANNEL whose caller bag carries the key and whose hop
    // declares a default on that slot, so a chain hostile on both fires it
    // twice and one hostile on neither never reaches it at all. That skip
    // carries its own ⚠ against dropping it on a reachability argument, and
    // sanitising the arguments here is that argument arriving from the other
    // side.
    //
    // ⚠ A SNAPSHOT, never the source object, and that is what makes the closure
    // real rather than defeatable. A hop's result may be accessor-backed — the
    // shape `proto-key-guarantee` builds — so returning it by identity when it
    // reads clean lets the next read answer poisoned. The literal is what the
    // interceptor outside then reads, so there is one read of the hop's object
    // and it is this one.
    //
    // ⚠ Both slots are nullish-guarded because both can arrive empty here:
    // `RoutesNamespace.forwardState` hands back the `params` it was given, so
    // `forwardState(name, undefined)` and a `decodeParams` that fills only the
    // query channel both reach the first hop empty; `search` cannot from THAT
    // source (`search ?? EMPTY_SEARCH` resolves it) but very much can from an
    // inner interceptor spreading a partial result. Left untouched rather than
    // defaulted: the wrapper below is what normalises them.
    const sanitiseForwarded = (result: {
      name: string;
      params: Params;
      search: SearchParams;
    }) => {
      const params = result.params;
      const search = result.search;

      return {
        name: result.name,
        params:
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the declared type cannot model what a codec or a partial return hands back
          params === undefined || params === null
            ? params
            : withoutUnsafeKey(params),
        search:
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- an interceptor spreading a partial result nulls the slot
          search === undefined || search === null
            ? search
            : withoutUnsafeKey(search),
      };
    };

    /**
     * What the `forwardState` chain is handed when a plugin is ON it (#1849).
     *
     * An interceptor is application code and the bags it receives are the
     * CALLER's. Read one and forward it, and the value the interceptor acted on
     * is not the value `canonicalize` reads a moment later — measured on a
     * getter-backed bag, the interceptor saw `S1` while the URL printed `S2`, on
     * both doors. One shallow copy per channel makes those two reads one.
     *
     * ⚠ A spread, NOT `normalizeChannel`. That one drops a key whose value is
     * `undefined`, and `undefined` is `persistent-params`' removal marker — the
     * copy would erase the signal before the plugin could read it. Measured:
     * eight of that package's cells red on the `normalizeChannel` form.
     *
     * ⚠ Absence passes through on BOTH spellings. `{ ...null }` is `{}`, which
     * would turn "no bag" into "empty bag" above the code that tells them apart.
     */
    const snapshotForwarded = (
      name: string,
      params: Params,
      search?: SearchParams,
    ): [string, Params, SearchParams | undefined] => [
      name,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `null` reaches these doors at runtime; the declared type cannot say so
      params === undefined || params === null ? params : { ...params },
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
      search === undefined || search === null ? search : { ...search },
    ];

    const rawForwardState = createTernaryInterceptable(
      SEAM.forwardState,
      (name: string, params: Params, search?: SearchParams) =>
        this.#routes.forwardState(name, params, search),
      interceptorsMap,
      sanitiseForwarded,
      snapshotForwarded,
    );

    const forwardState = ((
      name: string,
      params: Params,
      search?: SearchParams,
    ) => {
      const forwarded = rawForwardState(name, params, search);

      // ⚑ `name` and `params` into locals — and only those two (#1792).
      // `rawForwardState` is an interceptable, so `forwarded` may be backed by
      // accessors. Each of the two is read once by the channel check and once by
      // the object this returns, so without a local a chain result can answer
      // differently the second time and the check vouches for a value that never
      // ships. `search` needs no local: `assertChannelCorrect` never receives
      // it, so there is no check to fool, and hoisting it would only guarantee
      // the slot is read on the ERROR path too, handing a hostile interceptor a
      // side effect it does not have today. The same discipline the route
      // `updates` path enforces (#1738, pinned by `read-count-authority`); both
      // slots are pinned in `proto-key-guarantee` under "the seam reads the
      // slots it checks".
      const forwardedName = forwarded.name;
      const forwardedParams = forwarded.params;

      // The DECLARATION that matters is the RESOLVED route's — it owns the URL
      // that gets printed. When a chain resolved to a different route, say so:
      // a caller who wrote `navigate("src", { lang })` looked at `src`'s config,
      // where `lang` is undeclared and legitimate, and needs to be told that the
      // hop landed somewhere that spells it `?lang`. Naming only the target
      // would read as a message about a route they never mentioned.
      assertChannelCorrect(
        "forwardState",
        forwardedName,
        forwardedParams,
        this.#routes.getQueryParams(forwardedName),
        () =>
          forwardedName === name
            ? "the `params` bag leaving the forwardState chain"
            : `the \`params\` bag leaving the forwardState chain (forwarded here from "${name}")`,
      );

      // ⚑ Read HERE, below the check, not hoisted with the other two (#1986).
      // The sanitiser needs the VALUE, and hoisting the read above
      // `assertChannelCorrect` would perform it on the ERROR path too — the
      // side effect the note above deliberately denies a hostile interceptor.
      // One read either way, on the success path only, exactly as before.
      // ⚠ Widened, not suppressed. `SimpleState` declares `search` required and
      // the note above says why that is a CONTRACT rather than a guarantee —
      // measured through this seam, an interceptor spreading a partial result
      // leaves `undefined` in the slot, and the sanitiser below would throw on
      // it. The cast states the runtime type the `params` slot handles one line
      // down with `?? EMPTY_PARAMS`.
      const forwardedSearch = forwarded.search as SearchParams | undefined;

      const searchAbsent =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- an interceptor spreading a partial result nulls the slot; the declared type cannot model it
        forwardedSearch === undefined || forwardedSearch === null;

      // ⚑ Both channels leave sanitised (#1986). This seam is a PASS-THROUGH —
      // on the no-default fast path it hands back the caller's own bags — so
      // core mints no swap primitive here and the rule that closed #1957's doors
      // does not reach it. It is extended to this one anyway because the door is
      // INTERCEPTABLE: a plugin author arrives through the documented extension
      // seam and merges the result, so an own `__proto__` riding through would
      // be core handing a prototype-swap primitive to someone following the
      // instructions.
      //
      // ⚠ This copy is NOT the one that serves the chain, and the two do not
      // overlap. `sanitiseForwarded` above cleans what `next()` hands an
      // interceptor; this one cleans what the OUTERMOST interceptor hands the
      // caller, which no `next` wraps — and it is the only sanitiser at all when
      // no interceptor is registered, because the chain is skipped entirely
      // then. Removing either reds a cell the other leaves green.
      //
      // ⚠ AFTER the check, and that ordering is load-bearing: the check must
      // vouch for what SHIPS. What ships is now a SUBSET of what was checked,
      // and removing a key cannot introduce a mis-channelled one — while a
      // refusal throws before this line is reached.
      //
      // ⚠ `withoutUnsafeKey` is GATED on `hasOwn`, which is what makes this
      // affordable: a clean bag is returned by identity, so a navigation pays
      // one intrinsic read and no allocation. Pinned as its own cell in
      // `handed-out-containers-1957`, not left as a claim.
      //
      // ⚠ The query slot is guarded because an interceptor spreading a partial
      // result leaves `undefined` there — measured through this seam, not
      // assumed. The path slot has its own `?? EMPTY_PARAMS` for the same
      // reason, pinned in `forwardState.test.ts`.
      return {
        name: forwardedName,
        // The type says `params: P`, and across THIS boundary the type is a
        // contract, not a guarantee: `rawForwardState` is an interceptable, so
        // the value has passed through user code that can spread a partial
        // result. The net is reached only by that contract violation — still
        // worth surviving rather than putting `undefined` into `state.params`.
        // Pinned by "normalises a params bag an interceptor dropped to
        // `undefined`" in forwardState.test.ts, which fails if this is removed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above: the declared type cannot model an interceptor's runtime return
        params: withoutUnsafeKey(forwardedParams ?? EMPTY_PARAMS),

        search: searchAbsent
          ? forwardedSearch
          : withoutUnsafeKey(forwardedSearch),
      };
    }) as unknown as RouterInternals["forwardState"];

    // ⚑ **The SAME chain, one door lower (#2087).** `router.buildPath` runs the
    // `forwardState` seam on the caller's INTENT, so an injected value meets the
    // route's `defaultSearch` from ABOVE — the side `navigate` has always
    // injected from. Both doors then answer one intent with one URL, which is
    // INVARIANTS row 7 and what a plugin re-opened: the ⑤a `buildPath`
    // interceptable sits BELOW the merge, so a value injected there met an
    // already-defaulted bag and lost to it.
    //
    // ⚠ The terminal is LITERAL — it resolves no `forwardTo`. That is this
    // door's contract (`buildPath("src")` answers about `"src"`), and it is the
    // whole difference from the navigate door's terminal, which resolves.
    //
    // ⚠ No channel assert here, deliberately: render-path predicates are not
    // instrumented (#1572 / #1581), and the ⑤a seam this joins never carried one
    // either. The bag still meets `canonicalize`'s always-on mode gate below.
    const literalForwardState = createTernaryInterceptable(
      SEAM.forwardState,
      (name: string, params: Params, search?: SearchParams) => ({
        name,
        params,
        // The slot is optional and the sanitiser handles its absence; the
        // assertion states the shape `sanitiseForwarded` is typed against, the
        // same contract-not-guarantee the navigate seam records over its own.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see above
        search: search!,
      }),
      interceptorsMap,
      sanitiseForwarded,
      snapshotForwarded,
    );

    this.#buildPathIntent = (route, params, search) => {
      const forwarded = literalForwardState(route, params, search);

      // ⚑ Into locals for the reason the navigate door states over its own two
      // (#1792): the chain result may be accessor-backed, and each slot is read
      // once here and once by the call below.
      const forwardedParams = forwarded.params;
      const forwardedSearch = forwarded.search as SearchParams | undefined;

      // ⚠ No output sanitiser, and that is a difference from the navigate door
      // rather than an omission: what leaves THAT seam becomes `state.params`
      // directly, while what leaves this one goes through `canonicalize`, whose
      // `normalizeChannel` drops the unsafe key on both channels. Pinned rather
      // than argued — see the `__proto__` cell in the #2087 suite.
      return this.#routes.buildPathFromIntent(
        forwarded.name,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the declared type cannot model an interceptor spreading a partial result
        forwardedParams ?? EMPTY_PARAMS,
        forwardedSearch,
      );
    };

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
        SEAM.buildPath,
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
        // Channel (б): a REPORT to observers, not a machine failure. It comes
        // from a plugin, at a moment core does not control, so it must never
        // drive a transition that could collide with one in flight.
        this.#eventBus.emitTransitionError(
          undefined,
          this.#state.get(),
          error as RouterError,
        );
      },
      navigateToNotFound: (path) => this.#navigation.navigateToNotFound(path),
      revalidateToNotFound: (path) =>
        this.#navigation.revalidateToNotFound(path),
      start: createInterceptable(
        SEAM.start,
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
        // ⚑ The same withholding `getAll` performs one door over (#1823),
        // extended here because this door had the identical spread and no
        // delete (#1957). The store is `Object.create(null)`, so an own
        // `"__proto__"` sits there as an ORDINARY key — legitimate, and
        // `get("__proto__")` still answers — but a spread re-defines it on a
        // normal object and makes THIS container a prototype-swap primitive for
        // whoever merges it. `getCloneState` is reachable from the published
        // `@real-router/core/validation` subpath.
        //
        // ⚠ Consequence, and it is the one #1823 already took at `getAll`: a
        // dependency literally named `__proto__` does not reach a clone. The
        // base still holds it; the clone re-ingests this container, and the key
        // is no longer in it.
        dependencies: dropUnsafeKey({
          ...this.#dependenciesStore.dependencies,
        }),
        pluginFactories: this.#plugins.getAll(),
        // `logger` is a const in this constructor's scope (a RouterLogger class
        // instance), so getConfig() yields the resolved config a clone inherits
        // — frozen options don't carry `logger`, so cloneRouter reads it here.
        loggerConfig: logger.getConfig(),
        // Adjacent reason, one field over (#1880): `options.limits` is the
        // caller's bag, and an accessor on it is re-invoked by the clone's own
        // `createLimits`. These are already numbers. NOT the same mechanism as
        // `loggerConfig` above, though: that is a `getConfig()` call returning a
        // FRESH object per call, while this hands out `#limits` itself. What
        // makes handing it out safe is the freeze in `createLimits`.
        limits: this.#limits,
        limitKeys: this.#limitKeys,
      }),
      routeGetStore: () => this.#routes.getStore(),
      // Cross-namespace state (issue #174)
      getStateName: () => this.#state.get()?.name,
      isTransitioning: () => this.#eventBus.isTransitioning(),
      systemCommit: (toState, fromState, opts) =>
        this.#eventBus.systemCommit({ toState, fromState, opts }),
      routerExtensions: [],
      contextClaimRecords: new Map(),
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
    // (`buildPath()`, `isActiveRoute()`, `getState()`) does not hit a
    // half-assembled instance. Side-effectful calls (`navigate`, `usePlugin`,
    // route-CRUD) stay OUT OF CONTRACT: factories re-execute outside the
    // constructor (cloneRouter re-compiles definition guards per clone), so any
    // side effect would duplicate per re-execution — see CLAUDE.md. Runtime
    // add()/replace() compile guards in their own PREPARE phase and never touch
    // these pending maps.
    //
    // ⚑ The re-execution set is exactly the REGISTRATION paths (#1649).
    // `#recompileSlot` is a `Map` READ and not a factory invocation, so
    // "compiled once per registration per router" is the whole contract, with
    // no exception firing at a moment no caller could predict.
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
    // ⚑ ONE handle for the whole method. `getInternals` is a WeakMap lookup, and
    // this is a render-path predicate — a `<Link>` asks it on every render, so
    // repeating the lookup per validator hop is measurable (#1972).
    const ctx = getInternals(this);

    ctx.validator?.routes.validateIsActiveRouteArgs(
      name,
      params,
      strictEquality,
      ignoreQueryParams,
    );
    // ⚑ Beside it, not inside: the path bag is checked by the call above and
    // the query bag by its twin, so both halves of #1972's rule stand at every
    // door that takes both — including the two predicates.
    ctx.validator?.navigation.validateSearch(search, "isActiveRoute");
    ctx.validator?.routes.validateRouteName(name, "isActiveRoute");

    // Empty string is special case - warn and return false (root node is not a parent)
    if (name === "") {
      ctx.logger.warn(
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
    ctx.validator?.navigation.validateSearch(search, "buildPath");

    // `search` (RFC-4 M2 / #1548) is the explicit query channel; the matcher
    // builds the query string from it and the path from `params`, resolving a
    // colliding name (`/items/:id?id`). Omitted → the v1 single-bag path.
    //
    // ⚑ The INTENT form (#1847), not `ctx.buildPath`. That one is the ⑤a
    // EXECUTOR, which the port documents as taking already-merged channels — so
    // the merge belongs to whoever has an intent, and this door is the only
    // other one that does (`buildURL` is the first). Calling the executor from
    // here is what made it merge on its own, which cost the navigate path a
    // SECOND `canonicalize` and a second independent read of the route's live
    // default. Interceptors are unaffected: the intent form prints through
    // `buildURL` → `port.buildPath` → `ctx.buildPath`, one layer below.
    // ⚑ The caller's OWN bag, substituted only when absent — no normalise here
    // (#2087). What the chain SEES is the point: the navigate door hands its
    // interceptors the caller's object, and a door that normalised first would
    // hand the same chain a stripped copy. One seam, one input shape.
    //
    // ⚠ The strip still happens below the seam, and on two arcs rather than one:
    // `canonicalize` for a known route, and `buildPathFromIntent`'s
    // `UNKNOWN_ROUTE` branch, which skips the pipeline and spells its own.
    return this.#buildPathIntent(route, params ?? EMPTY_PARAMS, search);
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

    // The STOP edge's `update` shifts the pair — the facade only sends.
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
    this.#dependenciesStore.dependencies = objectCreate(
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
    ctx.validator?.navigation.validateSearch(search, "canNavigateTo");

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
    // very same primitive since #1573 (`isActiveRoute`'s own `try` around the
    // NAMESPACE `forwardState`, not the seam). Leaving
    // this one bare made the two render-path predicates disagree about what a
    // throwing resolution means.
    //
    // A separate `try` rather than widening the one below: that one is SILENT by
    // design (an unbuildable path is a normal "unreachable with this input"
    // answer, #725), while user code crashing is an operational fault that must
    // never vanish — the same split #959 draws for a throwing guard.
    // Stages ① + ③ + the mode gate, one pass through the pipeline (nav-pipeline
    // Phase 2, step 2-3). `canonicalize` reaches the `forwardState` seam through
    // `port.resolveForward`, which IS `ctx.forwardState` — so the resolution,
    // the interceptor zone and the channel CHECK all happen on that one seam
    // rather than in a composition assembled here.
    // Read ONCE (#1589): a second read for `buildURL` below would cost every
    // `<Link>` render one. The port is one object per router, created at wiring
    // time, so it could only ever return the same reference.
    const port = this.#routes.getPort();

    let canonical;

    try {
      canonical = canonicalize(
        port,
        name,
        // The singleton, not a fresh `{}` (#1589): this predicate runs on every
        // `<Link>` render too, and `normalizeChannel` recognises `EMPTY_PARAMS` by
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
    // `normalizeChannel` also aligns the params guards observe with navigate's.
    // `materializePending` mirrors the navigate guard phase, where guards see
    // an unfrozen `toState` carrying `DEFAULT_TRANSITION` (the freeze, and the
    // real meta, arrive later in `completeTransition`).
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
      // cannot drift. `materializePending` mirrors the navigate guard phase,
      // where guards see an unfrozen `toState`.
      toState = materializePending(canonical, buildURL(canonical, port));
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
      throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
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
    ctx.validator?.navigation.validateSearch(search, "navigate");
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
      throw freezeThrownError(new RouterError(errorCodes.ROUTER_NOT_STARTED));
    }

    if (path !== undefined && typeof path !== "string") {
      throw new TypeError(
        `[router.navigateToNotFound] path must be a string, got ${typeof path}`,
      );
    }

    if (path !== undefined) {
      // No boot-window predicate here any more (#1647). The window it named is
      // held by two mechanisms that were already load-bearing under it: from an
      // `onStart` hook or a `$start` / transition listener `#assertNotReentrant`
      // above throws first, and from a start INTERCEPTOR the machine is still
      // STARTING, where `SYSTEM_COMMIT` is not declared — so `systemCommit()`
      // refuses and names the phase itself. A guard OF the boot navigation stays
      // legal exactly as before: the primitive aborts that navigation first, so
      // its 404 displaces the boot's commit rather than being overwritten.
      return this.#navigation.navigateToNotFound(path);
    }

    const current = this.#state.get();

    // #1172: a path-less call derives the default path from the committed state.
    // During the two-phase start window the router is active (`isActive()` true)
    // while `getState()` is still undefined, so throw an actionable RouterError
    // instead of a cryptic `TypeError` from dereferencing the absent state —
    // same class as the #939 always-on invariant guards. Unconditional on the
    // in-flight question above: there is no path to derive either way.
    if (current === undefined) {
      throw freezeThrownError(
        new RouterError(errorCodes.ROUTER_NOT_STARTED, {
          message:
            "[router.navigateToNotFound] cannot derive the path before the start navigation commits — pass an explicit path",
        }),
      );
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
   * The wrap allocates nothing extra: a result that is already a Promise is
   * returned by identity.
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
   *   (RFC navigation-cancellation-unification §4) — and, since #1647, a
   *   `$start` listener too: a plugin's `onStart` runs on a READY machine that
   *   still owes the boot's commit, so a navigation from there would run to
   *   completion and the boot would overwrite it. Counting the `$start` emit
   *   puts that window under this rule rather than a predicate of its own.
   * - **Pre-start** (`isPreparing`, #1610) — a `forwardState` / `buildPath`
   *   interceptor, a route's dynamic `forwardTo` callback or its `encodeParams`,
   *   BEFORE the first emit. Not `decodeParams` (#1713): that one runs from
   *   `matchPath`, which prepares no navigation. The dispatch depth
   *   cannot see it: there has been no emit yet, which is why this window
   *   needs its own predicate — without one a nested `navigate()` runs to
   *   completion here, commits a phantom `TRANSITION_SUCCESS`, and shifts the
   *   outer transition's `fromState`.
   *
   * A guard is deliberately NOT either of them: it runs after the announce, so
   * the classic guard-redirect (`navigate(...)` then `return false`) stays a
   * plain supersede.
   *
   * ⚑ The two windows get DIFFERENT messages (#1665), and that is not polish.
   * The code names a rule the caller broke, and unlike a state error
   * (`ROUTER_DISPOSED`, `SAME_STATES`) the remedy does not follow from the name
   * — which is why the bare code produced two docs issues (#1203, #1219) and
   * nothing else. One text cannot serve both halves: "you are inside a
   * listener" is false for an interceptor, where no emit is on the stack at
   * all, and a developer told that reads their error as spurious. Splitting the
   * `||` costs the happy path nothing: it already evaluated both predicates in
   * this order.
   */
  #assertNotReentrant(): void {
    if (this.#eventBus.isProcessing()) {
      throw freezeThrownError(
        new RouterError(errorCodes.REENTRANT_NAVIGATION, {
          message:
            "[router] cannot start a navigation from inside a router event listener — the nested navigation would commit a state the outer one overwrites. Defer it: queueMicrotask(() => router.navigate(...)), await the current transition, or use an async listener.",
        }),
      );
    }

    if (this.#navigation.isPreparing()) {
      throw freezeThrownError(
        new RouterError(errorCodes.REENTRANT_NAVIGATION, {
          message:
            "[router] cannot start a navigation from inside a forwardState/buildPath interceptor, a route's encodeParams or dynamic forwardTo callback, or a defaultRoute/defaultParams/defaultSearch option callback — they run while a navigation is being prepared, before it is announced. Defer it: queueMicrotask(() => router.navigate(...)).",
        }),
      );
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
      this.#eventBus.sendStop();
    } else if (this.#eventBus.isStarting()) {
      this.#eventBus.sendFail(undefined, error);
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
  throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
}

/** The frozen empty snapshot, for a caller that supplied no `queryParams` at all. */
const EMPTY_QUERY_PARAMS: QueryParamsConfig = Object.freeze({});

/**
 * Coerces one format slot to its STRING key, once, at snapshot time.
 *
 * ⚑ The snapshot copies the four values, and copying a value by reference is not
 * the same as capturing it. `requireStrategy` coerces each one with
 * `ToPropertyKey` to look it up, so an object-valued format is re-read on every
 * matcher build — and the matcher is rebuilt more often than "at construction"
 * suggests: `setRootPath`, `replace()`, and `dispose()`, which reaches
 * `resetStore` → `rebuildTreeInPlace` → `createMatcher`.
 *
 * Without it a `{ toString }` answering `"none"` then `"bogusTypo"` constructs
 * cleanly and makes **`dispose()` throw** the config error, out of a method that
 * is idempotent by contract and is called from `finally` blocks — where a throw
 * discards whatever error was already travelling. Freezing the CONTAINER does
 * not reach this: it stops the bag being swapped, and a single slot can still
 * answer twice.
 *
 * Coercing here means the caller's object is read exactly once per router, at
 * construction, and every later rebuild resolves from a string. It does not
 * change which configs are refused — `requireStrategy` sees the same key it
 * would have computed — only how many times the caller is asked.
 *
 * ⚠ `typeof` first is a PERF TERM, and a tiny one — it is NOT a guard, and
 * reading it as one is what this paragraph exists to prevent. Measured both
 * ways. INERT: delete the branch, so every non-nullish slot goes through
 * `String(value)`, and the whole suite stays green — for a string
 * `String(s)` returns `s` itself, and `ToString` of a String consults no user
 * code, so nothing observable rides on the test. WORTH: the branch saves
 * ~0.9 ns per slot, i.e. ~3.5 ns per `createRouter`, against a construction
 * measured at ~13.6 µs — 0.03 %, two orders of magnitude under the 10 %
 * CodSpeed gate, and nothing in the gate measures it. It stays for the reason
 * the same shape stays in `requireStrategy`: the coercion is reserved for
 * exactly the values that are not already keys.
 *
 * ⚑ So it is an EQUIVALENT MUTANT by construction: no test can kill it, and a
 * mutation run reporting this branch as survived is right. This note is the
 * answer to that report — do not "cover" it with a test that cannot fail.
 *
 * ⚠ NULLISH IS ABSENCE, and both halves carry weight. Guarding `undefined`
 * alone lets `null` reach `String(null)` and become the STRING `"null"`, which
 * `makeOptions`' `?? DEFAULT_QUERY_PARAMS.x` can then never rescue, because it
 * is handed a non-nullish value. `null` is what a config from `JSON.parse`,
 * from YAML, or from `cfg.x ?? null` actually carries — never `undefined` — so
 * this is the reachable half of "nullish", not the exotic one.
 *
 * ⚠ A `symbol` is deliberately NOT special-cased, and the reason is NOT that
 * `String` throws on one: it does not. `String(Symbol("x"))` is `"Symbol(x)"` —
 * the single legal symbol stringification, which is why a template literal
 * (`${symbol}`) and `symbol + ""` throw where this call does not. That is what
 * makes the named refusal possible: `requireStrategy` receives `"Symbol(x)"`,
 * finds no such key, and reports the option by name.
 */
function asKey<K extends keyof QueryParamsConfig>(
  field: K,
  bag: QueryParamsConfig,
): QueryParamsConfig[K] | undefined {
  // ⚑ The READ happens HERE, inside the guarded region, and that placement is
  // the point. Reading the slot at the CALL SITE — `asKey("arrayFormat",
  // queryParams.arrayFormat)` — invokes an accessor-backed bag's getter one
  // frame ABOVE this try/catch, so a `{ get arrayFormat() { throw } }` config
  // escapes `createRouter` as a raw `Error`, with no `cause` and no option
  // named, against the paragraph below. An accessor-backed config is the
  // ordinary lazy-config spelling, not an exotic one.
  //
  // ⚑ The container is not read before this point (#1832): core freezes only the
  // level it owns, so nothing asks a caller's bag for `constructor`, and a Proxy
  // whose trap throws on that slot reaches this try/catch like any other. Pinned
  // by the CONTROL cell in `query-strategy-formats-1796.test.ts`.
  let value: QueryParamsConfig[K] | undefined;

  try {
    value = bag[field];
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "queryParams.${field}": reading it threw.`,
      { cause: error },
    );
  }

  // `== null` is the intent: BOTH nullish values mean "the caller said nothing",
  // and `makeOptions`' `??` downstream is what turns that into the default.
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  // ⚠ `String(value)` runs the CALLER's code, and this snapshot moved that call
  // into `createRouter`. Uncaught, an application's own exception escapes the
  // constructor naming no option at all — strictly less useful than the named
  // refusal one line down, and a shape `options.test.ts` pins the opposite of
  // for the sibling `defaultRoute` slot. So the coercion answers for itself: a
  // value we cannot READ is a config fault about THIS field, and the original
  // error rides along as `cause` rather than being replaced by it.
  //
  // ⚠ The message does not name `toString`, and that is deliberate — TWO shapes
  // land here and only one of them threw. A `toString` that RETURNS a symbol
  // makes `String()` throw from the conversion, not from the callback; saying
  // "its toString threw" would be false for exactly the case a developer would
  // find hardest to see. `cause` carries the real mechanism.
  try {
    // The cast is the honest shape: the STATIC type says this slot is one of the
    // declared union members, and the runtime disagrees — that is the whole
    // reason the coercion exists. What comes back may name no strategy at all,
    // and `requireStrategy` is the one that decides, by the same key it would
    // have computed itself.
    return String(value) as QueryParamsConfig[K];
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "queryParams.${field}": its value cannot be converted to a string.`,
      { cause: error },
    );
  }
}

/**
 * ⚑ Read ONCE, here, and hand the KEY downstream — the same treatment
 * `snapshotQueryParams` gives `queryParams`, the next property in the literal
 * below, and for the same reason (#1839).
 *
 * The declared type is a union of four literals, and that union is precisely
 * what cannot be trusted: the option reaches here from JavaScript consumers and
 * from configs assembled at runtime, which is the population `SegmentMatcher`'s
 * own `"default"` fallback exists for. Stored raw in
 * `RoutesStore.matcherOptions`, an object-valued encoding is left for the
 * matcher's constructor to coerce — so a `toString`- or
 * `Symbol.toPrimitive`-backed VALUE is read again on every matcher rebuild:
 * `add` / `remove` / `replace` / `clear` / `setRootPath`, and the `resetStore`
 * that `dispose()` goes through. (A getter
 * on the OPTIONS BAG was never affected — the constructor's rest-spread
 * materialises it once.)
 *
 * Coercing here moves that into construction, where application code is
 * expected and where a throw is loud and total. `cloneRouter` inherits the key
 * rather than re-reading the option (#1877), so the unit is one read per router
 * TREE.
 *
 * ⚠ NOT `asKey`: that helper is typed `keyof QueryParamsConfig`, takes a
 * `QueryParamsConfig` bag, and hardcodes `queryParams.${field}` into its
 * message, so reusing it would widen a guard four other call sites depend on.
 *
 * The table lookup and the `"default"` fallback stay in `SegmentMatcher`, which
 * already stores the key it tested. This only guarantees that what it tests is
 * plain data by the time it gets there.
 */
function snapshotEncodingKey(
  value: unknown,
): NonNullable<CreateMatcherOptions["urlParamsEncoding"]> {
  // `== null` is the intent: both nullish spellings mean "the caller said
  // nothing", and `exactOptionalPropertyTypes` forbids answering `undefined`.
  // This arm is not cosmetic and it is pinned: without it the stored key would
  // read `"null"`, and that slot is published through
  // `@real-router/core/validation`.
  if (value == null) {
    return "default";
  }

  try {
    // Identity for a string, `ToString` for anything else. There is no
    // `typeof value === "string"` fast path in front of this: it would run once
    // per router constructor, it was never benchmarked, and `String("uri")` is
    // already `"uri"` — an unmeasured branch that changes no answer is a branch
    // no mutation can pin. The matcher's table lookup rejects whatever comes out
    // and falls back to `"default"`, exactly as it did when it ran this coercion
    // itself; the lint rule reads the declared union, which is what this
    // distrusts.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see above
    return String(value) as NonNullable<
      CreateMatcherOptions["urlParamsEncoding"]
    >;
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "urlParamsEncoding": coercing it threw.`,
      { cause: error },
    );
  }
}

/**
 * A plain-data copy of the caller's `queryParams`, read once.
 *
 * ⚑ The four names are written out, and that is a hand enumeration of
 * `search-params`' `Options` — bound to it by the `search-params Options ↔
 * snapshotQueryParams' copy` relation in
 * `tests/functional/type-mirror-authority.test.ts`, which derives the key set
 * from the type and fails if a fifth field is added without reaching here. A
 * spread would not need the list, but would drop the two shapes the comment at
 * the call site names.
 *
 * ⚠ These reads WALK the prototype chain, deliberately, and they are not the
 * class #1798 closed one directory over. That rule is about a key whose NAME
 * comes from a route declaration read off the CALLER's data bag, where an
 * `Object.prototype` member makes an empty bag answer "filled". Here the four
 * names are literals written above, none of them is a member of
 * `Object.prototype`, and the chain walk is the FEATURE — it is what lets one
 * config be layered over another. Do not "fix" this to `Object.hasOwn`.
 */
function snapshotQueryParams(
  queryParams: QueryParamsConfig | undefined,
): QueryParamsConfig {
  // `!` rather than `=== undefined`: the STATIC type says the container is an
  // object or absent, and the runtime disagrees — `{ queryParams: null }` is
  // reachable from JavaScript and from a config assembled at runtime. Mirrors
  // `makeOptions`' own `!opts` guard, which is the collaborator this feeds.
  if (!queryParams) {
    return EMPTY_QUERY_PARAMS;
  }

  // ⚠ Into locals FIRST, and this is the whole point of the helper rather than a
  // style choice. `...(queryParams.x !== undefined && { x: queryParams.x })`
  // reads the property TWICE — once for the test, once for the value — which is
  // the exact TOCTOU this snapshot exists to collapse, merely moved out of
  // `makeOptions` and into here. Measured with a getter that answers differently
  // on its second call: the router ran on the SECOND value while the test that
  // admitted it saw the first.
  // ⚑ FROZEN, and for the reason `encode.ts` freezes its three defaults: this
  // object is reachable from outside core through `getInternals`
  // (`@real-router/core/validation`), and every matcher rebuild re-reads it. The
  // slot it replaced is sealed by nobody else — `OptionsNamespace` freezes only
  // the level it owns (#1832) — so a plain literal would be writable: a write took
  // effect on the next rebuild, and `Object.defineProperty` could re-install an
  // accessor in the very slot this snapshot exists to empty, restoring the defect
  // it fixes. Nothing in the repo writes it, so the freeze costs nothing and makes
  // read-only structural rather than conventional.
  const arrayFormat = asKey("arrayFormat", queryParams);
  const booleanFormat = asKey("booleanFormat", queryParams);
  const nullFormat = asKey("nullFormat", queryParams);
  const numberFormat = asKey("numberFormat", queryParams);

  return freeze({
    ...(arrayFormat !== undefined && { arrayFormat }),
    ...(booleanFormat !== undefined && { booleanFormat }),
    ...(nullFormat !== undefined && { nullFormat }),
    ...(numberFormat !== undefined && { numberFormat }),
  });
}

/**
 * Derives CreateMatcherOptions from router Options.
 * Maps core option names to matcher option names.
 */
function deriveMatcherOptions<Dependencies extends DefaultDependencies>(
  options: Readonly<Options<Dependencies>>,
): CreateMatcherOptions {
  // ⚑ The CONTAINER is frozen too, not only the snapshot inside it, and that is
  // the half a first pass missed. Freezing the snapshot stops a WRITE INTO it;
  // it does nothing about REPLACING the slot that holds it — and the slot is
  // reachable, through the very surface cited as the reason to freeze at all:
  // `getInternals(router).routeGetStore().matcherOptions` on the published
  // `@real-router/core/validation` subpath. Measured: swapping `queryParams`
  // there for `{ arrayFormat: "bogusTypo" }` made `add`, `setRootPath` and
  // `dispose()` throw, i.e. it restored the defect verbatim. Frozen, the write
  // fails at the write site instead.
  return freeze({
    strictTrailingSlash: options.trailingSlash === "strict",
    caseSensitive: options.caseSensitive,
    strictQueryParams: options.queryParamsMode === "strict",
    urlParamsEncoding: snapshotEncodingKey(options.urlParamsEncoding),
    // SNAPSHOT, not the caller's reference. `queryParams` is supported input and
    // may be accessor- or Proxy-backed, and this object is stored once as
    // `RoutesStore.matcherOptions` and re-read by `createMatcher` on EVERY matcher
    // rebuild — `add` / `remove` / `replace` / `setRootPath`, and `resetStore`,
    // which `dispose()` goes through. A live getter there is application code
    // running inside a teardown that core documents as holding together "only
    // because no user code runs in them" (CLAUDE.md, INVARIANTS Route Management
    // #17/#18): a getter that answered differently on the rebuild threw out of
    // `dispose()` AFTER `sendDispose()`, so `isDisposed()` was already true, the
    // idempotency early-return swallowed every retry, and everything BELOW the
    // throw never ran — `markDisposed`, the lifecycle teardown and the dependency
    // reset — so the router leaked every DI reference, per request, in an SSR
    // scope. ⚠ The event-bus `clearAll` is ABOVE it and does run; and what such a
    // router still answers is `buildPath` / `canNavigateTo` / `has`, not
    // `navigate` (the FSM is already down, so that one refuses — with the wrong
    // reason, `ROUTER_NOT_STARTED`). Measured on the pre-fix build against a
    // clean-dispose control.
    //
    // The snapshot reads each field exactly ONCE, during construction, where
    // application code is expected; every later read sees plain data. That also
    // collapses the TOCTOU inside `makeOptions`, which tests a field and then
    // re-reads it for the value. ⚠ Not "each field twice" — its fast path is a
    // `&&` chain, so it stops at the first DEFINED field: for the bag a router
    // actually passes, `arrayFormat` is read twice and the other three once.
    //
    // ⚑ ONCE, by the snapshot, and by nothing else: the freeze stops at the level
    // core owns (#1832), so it neither reads a value here nor asks for a
    // descriptor. Measured on a Proxy bag — four named reads, zero descriptor
    // traps — in `query-strategy-formats-1796.test.ts`. The count AFTER
    // construction is ZERO.
    // ⚠ Read by NAME, not `{ ...queryParams }`, and the difference is measured
    // rather than stylistic: a spread copies own ENUMERABLE keys, so an inherited
    // format (`Object.create({ arrayFormat: "brackets" })` — layering one config
    // over another) or an own non-enumerable one was silently dropped and the
    // router fell back to the defaults. Both worked before the snapshot, because
    // a plain `opts.arrayFormat` walks the prototype chain. Reading by name keeps
    // that lookup and still yields plain own data.
    //
    // The conditional spread is `exactOptionalPropertyTypes`: an optional
    // property may be absent but not present-and-`undefined`, and `makeOptions`
    // treats the two identically anyway (its fast path tests `=== undefined`).
    queryParams: snapshotQueryParams(options.queryParams),
  });
}
