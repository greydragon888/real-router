// packages/core/src/Router.ts

/**
 * Router class - facade with integrated namespaces.
 *
 * All functionality is now provided by namespace classes.
 */

import { assertChannelCorrect, findMisChanneledKey } from "./channels";
import {
  EMPTY_OPTS,
  EMPTY_PARAMS,
  errorCodes,
  UNKNOWN_ROUTE,
} from "./constants";
import {
  clearDependencies,
  createDependenciesStore,
  snapshotDependencies,
} from "./dependenciesStore";
import {
  assertEventNameIsValid,
  assertListenerIsFunction,
  assertLoggerConfig,
  guardDependencyShape,
  guardRouteStructure,
} from "./guards";
import { adoptChannel, withoutUnsafeKey } from "./helpers";
import {
  createInterceptable,
  createTernaryInterceptable,
  getInternals,
  POSITION,
  registerInternals,
  runChecks,
  SEAM,
  throwIfDisposed,
  throwOnMisChanneledKey,
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
} from "./namespaces";
import { isExpectedRejection } from "./namespaces/NavigationNamespace/constants";
import {
  adoptOptionBags,
  weakOrigins,
} from "./namespaces/OptionsNamespace/adoption";
import {
  createLimits,
  snapshotLimitKeys,
} from "./namespaces/OptionsNamespace/limits";
import { deriveMatcherOptions } from "./namespaces/OptionsNamespace/matcherOptions";
import { CACHED_ALREADY_STARTED_ERROR } from "./namespaces/RouterLifecycleNamespace/constants";
import { buildURL, canonicalize, materialize } from "./pipeline";
import { raiser, RouterError, freezeThrownError } from "./RouterError";
import { createRouterFSM } from "./routerFSM";
import { getTransitionPath } from "./transitionPath";
import { EventEmitter } from "./utils/event-emitter";
import { RouterLogger } from "./utils/logger";
import { wireNamespaces } from "./wiring";

import type { DependenciesStore } from "./dependenciesStore";
import type { RouterInternals } from "./internals";
import type {
  AdoptedOrigins,
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

/** One binding per door this module refuses behind (#2487). */
const atNavigateToNotFound = raiser("router", "navigateToNotFound");

const atUsePlugin = raiser("router", "usePlugin");
const atStart = raiser("router", "start");
const atRouter = raiser("router");

/**
 * Router class with integrated namespace architecture.
 *
 * The facade delegates to namespace classes and one store it owns:
 * - OptionsNamespace: getOptions (immutable)
 * - DependenciesStore: the dependency record (`dependenciesStore.ts`) — a
 *   store, not a namespace; `getDependenciesApi` edits it
 * - EventBusNamespace: the FSM and the EventEmitter; subscribe
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

  /**
   * Where the two behaviour-bearing option bags CAME FROM, weakly (#2148).
   *
   * ⚑ **Weak, and that word carries the whole design.** Core does not hold the
   * application's container (#2171), and a strong field here would be holding it.
   * A `WeakRef` is not: it knows where the bag was, if the bag is still alive, and
   * the application can free it at any time.
   *
   * ⚑ **Diagnostic only, and nothing routes through it.** Adoption already took
   * the copy the router runs on; this exists so `@real-router/validation-plugin`
   * can tell an application that mutating its config after `createRouter` no
   * longer reaches the router. Core stays silent — it is the layer that degrades,
   * the plugin is the layer that reports, which is the split
   * `packages/core/CLAUDE.md` › Supported Input Shapes already decides.
   *
   * ⚠ TWO slots, not four. `queryParams` is not adopted at all, and core stops
   * reading `limits` once `createLimits` has taken its numbers — so a late
   * mutation of either changes no behaviour and has nothing to report.
   *
   * `isWatchableBag` (`namespaces/OptionsNamespace/adoption.ts`) owns which
   * slots earn an entry, and why.
   */
  readonly #adoptedOrigins: AdoptedOrigins;
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

    // Per-router logger instance, so a configure() reaches one router rather
    // than the process (#724). Stored on ctx (registerInternals below), so the
    // facade reads getInternals(this).logger; namespaces receive it via their
    // deps at wiring; a plugin reads the frozen three-method view PluginApi
    // carries (#2339 slice 2), not this instance.
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

    // ⚑ The walk RETURNS core's batch (#2139), so the constructor door snapshots
    // where it guards instead of handing the caller's array on to be walked a
    // second time inside `createRoutesStore`. No `routes.length` gate any more:
    // an empty list produces an empty batch through the same line, and the gate
    // only existed to skip a no-op.
    const routeBatch = guardRouteStructure(routes);

    // =========================================================================
    // Create Namespaces
    // =========================================================================

    // ⚑ Adopted BEFORE the namespace, so every reader below — the options
    // freeze, `createLimits`, the `#limitKeys` snapshot, `deriveMatcherOptions`,
    // and `getCloneState().options` after them — sees core's own object rather
    // than the caller's (#2171). One read of each caller bag, at this line.
    const adoptedOptions = adoptOptionBags(routerOptions);

    this.#adoptedOrigins = weakOrigins(routerOptions);

    this.#options = new OptionsNamespace(adoptedOptions);
    this.#limits = createLimits(adoptedOptions.limits);
    this.#limitKeys = snapshotLimitKeys(adoptedOptions.limits);
    this.#dependenciesStore = createDependenciesStore<Dependencies>(
      dependencies,
      this.#limits,
    );
    this.#state = new StateNamespace();
    this.#routes = new RoutesNamespace<Dependencies>(
      routeBatch,
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
        logger.error("router", `Error in listener for ${eventName}:`, error);
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
    const checksMap: RouterInternals["checks"] = new Map();

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
    // and each interceptor into the one outside it. It is the only cover for a
    // plugin poisoning the one outside it, and `swapsOnMerge` in
    // `handed-out-containers-1957.test.ts` owns which merge idiom an own
    // `__proto__` actually reaches: `Object.assign`, never a spread.
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
    // INVARIANTS row 7.
    //
    // ⚠ The terminal is LITERAL — it resolves no `forwardTo`. That is this
    // door's contract (`buildPath("src")` answers about `"src"`), and it is the
    // whole difference from the navigate door's terminal, which resolves.
    //
    // ⚠ No channel assert here, deliberately: render-path predicates are not
    // instrumented (#1572 / #1581). The bag still meets `canonicalize`'s
    // always-on mode gate below.
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

    // ⚑ Named rather than passed as a literal, so an adapter below can reach
    // `internals.validator` at CALL time without a WeakMap hop per call. The
    // guards live here rather than on the facade (#2259): `getInternals` ships
    // from `@real-router/core/validation` and a door reachable both ways must
    // refuse the same values from either side.
    const internals: RouterInternals<Dependencies> = {
      logger,
      makeState: (name, params, search, path) => {
        throwOnMisChanneledKey(internals, "makeState", name, params);

        // ⚑ Core's SINGLE read of the caller's bag (#2134), and it is here
        // rather than on the facade so both doors judge and ship the same one.
        const ownParams = adoptChannel(params);

        internals.validator?.state.validateMakeStateArgs(name, ownParams, path);
        internals.validator?.navigation.validateSearch(search, "makeState");

        return this.#state.makeState(name, ownParams, search, path);
      },
      getMetaForState: (name) => this.#routes.getMetaForState(name),
      getDeclaredQueryNames: (name) => this.#routes.getQueryParams(name),
      forwardState,
      buildStateResolved: (name, params) =>
        this.#routes.buildStateResolved(name, params),
      buildPathResolved: (name, params, search) => {
        // ⚑ Core's SINGLE read of the caller's bag (#2134), for the same reason
        // the facade's printer takes one: `forwardState` hands its container
        // back BY IDENTITY on a clean bag, so what arrives here is the
        // APPLICATION's object, and the layer that judges must read the one the
        // layer that prints ships.
        const ownParams = adoptChannel(params);

        // ⚠ No channel assert, and that is inherited rather than overlooked:
        // the facade's printer has none either, because render-path predicates
        // are not instrumented (#1572 / #1581). The href door's `??` fallback
        // depends on it — a declared query name handed in the PATH bag makes
        // the RESOLVING door throw and this one print, which is the href that
        // arm has always rendered.
        internals.validator?.navigation.validateParamsShape(
          params,
          "buildPathResolved",
        );
        internals.validator?.navigation.validateSearch(
          search,
          "buildPathResolved",
        );
        // ⚑ Core does not hold the refusal here — it asks whether anyone
        // objects (#2388), at the position handed the copy that ships.
        runChecks(
          internals.checks,
          POSITION["buildPathResolved:params"],
          ownParams,
        );

        return this.#routes.buildPathFromIntent(
          name,
          ownParams ?? EMPTY_PARAMS,
          search,
        );
      },
      port: () => this.#routes.getPort(),
      matchPath: (path, matchOptions) => {
        internals.validator?.routes.validateMatchPathArgs(path);

        // ⚠ The signature declares `options?`, so the bag may be OMITTED — and
        // the matcher reads `rewritePathOnMatch` off it, which made the door
        // crash on a call its own type allows (#2254). The default is what the
        // `PluginApi` sibling has always passed, so the two now answer the same
        // call the same way.
        return this.#routes.matchPath(
          path,
          matchOptions ?? this.#options.get(),
        );
      },
      getOptions: () => this.#options.get(),
      getAdoptedOrigins: () => this.#adoptedOrigins,
      addEventListener: (eventName, cb) => {
        throwIfDisposed(internals.isDisposed);

        assertEventNameIsValid(eventName);
        assertListenerIsFunction(cb);
        internals.validator?.eventBus.validateListenerArgs(eventName, cb);

        return this.#eventBus.addEventListener(eventName, cb);
      },
      subscribeDiagnostic: (key, handler) =>
        this.#eventBus.subscribeDiagnostic(key, handler),
      treeChanged: {
        emit: (event) => {
          this.#eventBus.emitTreeChanged(event);
        },
        subscribe: (handler) => this.#eventBus.subscribeTreeChanged(handler),
        listenerCount: () => this.#eventBus.treeChangedListenerCount(),
        isEmitting: () => this.#eventBus.isEmittingTreeChanged(),
      },
      emitTransitionError: (error) => {
        // Channel (b): a REPORT to observers, not a machine failure. It comes
        // from a plugin, at a moment core does not control, so it must never
        // drive a transition that could collide with one in flight.
        this.#eventBus.emitTransitionError(
          undefined,
          this.#state.get(),
          error as RouterError,
        );
      },
      navigateToNotFound: (path) => {
        // ⚠ The public facade's own check, copied EXACTLY (#2259) — including
        // the `!== undefined` arm. The internals signature declares `path`
        // required, so a stricter test reads as defensible and is not: it would
        // refuse the omitted argument the facade accepts, which is a divergence
        // in the other direction rather than parity.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the rule reads the declared type, which is exactly what this line distrusts: `getInternals` is published and a JS caller is not bound by it
        if (path !== undefined && typeof path !== "string") {
          throw atNavigateToNotFound.type`path must be a string, got ${typeof path}`;
        }

        return this.#navigation.navigateToNotFound(path);
      },
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
        throwIfDisposed(internals.isDisposed);
        internals.validator?.navigation.validateNavigateToStateArgs(state);

        if (navOpts !== undefined) {
          internals.validator?.navigation.validateNavigationOptions(
            navOpts,
            "navigateToState",
          );
        }

        this.#assertNotReentrant();

        return Router.#asPromise(
          this.#navigation.navigateToState(state, navOpts ?? EMPTY_OPTS),
        );
      },
      interceptors: interceptorsMap,
      checks: checksMap,
      setRootPath: (rootPath) => {
        internals.validator?.routes.validateSetRootPathArgs(rootPath);
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
        // ⚑ The same container `getAll()` hands out: this door is published
        // too, through `@real-router/core/validation`, so whoever merges it
        // needs the same withholding. `snapshotDependencies` owns it.
        dependencies: snapshotDependencies(this.#dependenciesStore),
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
      systemCommit: (toState, fromState, opts) => {
        // ⚑ ONE read of the caller's name (#2085), taken above both consumers.
        // The State may be a plugin's, so each read is a call into application
        // code, and asking twice lets the door commit a name it never checked.
        const name = toState.name;

        // ⚠ The SAME existence check `navigateToState` makes (#2252). Both
        // members take a caller-supplied `State` and the door register groups
        // them as one mechanism, but only one asked: a `history.state` entry
        // deserialised from an older build, or written by another app on the
        // same origin, arrives here and became `getState()` with a `name` the
        // table never held — every consumer downstream is typed against
        // `string`. `UNKNOWN_ROUTE` stays legal: it is `navigateToNotFound`'s
        // own output shape.
        //
        // ⚠ It THROWS where the sibling rejects, and that is not the asymmetry
        // `internals.ts` records for `navigateToState`: this member returns a
        // `State` synchronously and has no promise to reject.
        if (name !== UNKNOWN_ROUTE && !this.#routes.hasRoute(name)) {
          throw freezeThrownError(
            new RouterError(errorCodes.ROUTE_NOT_FOUND, { routeName: name }),
          );
        }

        return this.#eventBus.systemCommit({ toState, fromState, opts });
      },
      routerExtensions: [],
      contextClaimRecords: new Map(),
    };

    registerInternals(this, internals);

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
        "router.isActiveRoute",
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

    ctx.validator?.routes.validateBuildPathArgs(route, params);
    ctx.validator?.navigation.validateParamsShape(params, "buildPath");
    ctx.validator?.navigation.validateSearch(search, "buildPath");

    // ⚑ Core's SINGLE read of the caller's bag, and it happens here so that the
    // layer which judges and the layer which ships read the same one (#2134).
    // Everything below — the seam, the validator's value walk, the merge — sees
    // this object, so a key that answers differently per read is admitted on
    // the same value it is printed with.
    const ownParams = adoptChannel(params);

    // ⚑ Core does not hold the refusal here — it asks whether anyone objects
    // (#2388). `@real-router/validation-plugin` registers the value walk at this
    // position; with no plugin installed nothing is registered and the call runs
    // on. The three consultations above still reach `ctx.validator`, so this
    // door is the one where both shapes stand side by side.
    runChecks(ctx.checks, POSITION["buildPath:params"], ownParams);

    // `search` (RFC-4 M2 / #1548) is the explicit query channel; the matcher
    // builds the query string from it and the path from `params`, resolving a
    // colliding name (`/items/:id?id`). Omitted → the v1 single-bag path.
    //
    // ⚑ The INTENT form (#1847). The merge belongs to whoever has an intent,
    // and this door is one of the two that do (`buildURL` is the other); the
    // executor below takes already-merged channels, which is what keeps a
    // navigation from running `canonicalize` twice over two independent reads
    // of the route's live default. The chain a plugin registers is not below
    // this line but ABOVE it — `#buildPathIntent` runs the `forwardState` seam
    // on the caller's intent first (#2087).
    // ⚑ CORE's copy, and #2087's rule is what makes that safe rather than what
    // forbids it. The rule is one seam, one input shape: both producers hand
    // their interceptors the same kind of object, and both copy at the same
    // point. The copy is `adoptChannel`, so what the chain sees carries the
    // caller's keys and values exactly — including an `undefined` one, which is
    // a plugin's removal marker and NOT core's to drop this far up.
    //
    // ⚠ The strip below the seam STAYS, on two arcs rather than one:
    // `canonicalize` for a known route, and `buildPathFromIntent`'s
    // `UNKNOWN_ROUTE` branch, which skips the pipeline and spells its own. It is
    // not redundant with the copy above — an interceptor runs BETWEEN them and
    // may inject `undefined` values of its own, which is the case that put the
    // strip there.
    return this.#buildPathIntent(route, ownParams ?? EMPTY_PARAMS, search);
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

    // The FOURTH such channel (#2388), and it needs the net for the same reason
    // the one above states: `buildPath` reads this Map live and is not
    // method-swapped by dispose, so a check a plugin failed to remove in
    // teardown would keep refusing on a disposed router.
    ctx.checks.clear();

    this.#routes.clearRoutes();
    this.#routeLifecycle.clearAll();
    clearDependencies(this.#dependenciesStore);

    this.#markDisposed();
  }

  // ============================================================================
  // Route Lifecycle (Guards)
  // ============================================================================

  canNavigateTo(name: string, params?: Params, search?: SearchParams): boolean {
    const ctx = getInternals(this);

    runChecks(
      ctx.checks,
      POSITION["canNavigateTo:entry"],
      name,
      params,
      search,
    );

    // The same single read as the two producers (#2134) — the predicate must
    // answer about the bag they would ship, not about an earlier read of it.
    //
    // ⚠ Guarded, because the read is APPLICATION code and this door is
    // documented TOTAL (INVARIANTS canNavigateTo #5, #725): a getter that throws
    // is an unreachable route, not an exception into a `<Link>` render. The
    // strip below the seam sits inside the `try` around `canonicalize`, so a
    // read placed ABOVE that one needs a net of its own — this is that net, and
    // the two together mean no read on this door escapes as an exception.
    let ownParams: Params | undefined;

    try {
      ownParams = adoptChannel(params);
    } catch (error) {
      ctx.logger.warn(
        "router.canNavigateTo",
        `Reading the params bag for route "${name}" threw; treating the route as unreachable.`,
        error,
      );

      return false;
    }

    runChecks(ctx.checks, POSITION["canNavigateTo:params"], ownParams);

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
        // The door's own copy (#2134), not the caller's bag: reading it a second
        // time here is exactly the divergence the copy exists to remove — the
        // predicate would answer about a later read than the one it validated.
        //
        // The singleton, not a fresh `{}` (#1589): this predicate runs on every
        // `<Link>` render too, and `normalizeChannel` recognises `EMPTY_PARAMS` by
        // identity — a literal makes it walk and re-allocate instead.
        ownParams ?? EMPTY_PARAMS,
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
      // ⑤a then ⑤b, from the SAME canonical intent — so `toState.search` and
      // `toState.path` cannot drift. `materializePending` mirrors the navigate
      // guard phase, where guards see an unfrozen `toState`.
      toState = materialize(canonical, buildURL(canonical, port));
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
      throw atUsePlugin.code(
        errorCodes.ROUTER_DISPOSED,
      )`cannot install a plugin on a disposed router — dispose() is terminal`;
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

    runChecks(
      ctx.checks,
      POSITION["navigate:entry"],
      routeName,
      routeParams,
      search,
      opts,
    );

    // ⚑ One read for the whole navigation (#2134). `buildNavigateState` runs
    // `validateStateBuilderArgs` further down the pipeline, and it now receives
    // this object rather than the caller's — which is why the door's count
    // falls from four reads to one and not merely to two.
    //
    // ⚠ A REJECTION, not a synchronous throw. The read is application code, and
    // everything this method answers with is a promise — a getter that throws
    // belongs in the caller's `.catch()`, not past it. The facade's own guards
    // above DO throw synchronously: those are programmer error, and #1572 pins
    // that shape deliberately.
    let ownParams: Params | undefined;

    try {
      ownParams = adoptChannel(routeParams);
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve the original throw shape from the caller's own accessor
      return Promise.reject(error);
    }

    runChecks(ctx.checks, POSITION["navigate:params"], ownParams);

    return Router.#asPromise(
      this.#navigation.navigate(
        routeName,
        ownParams ?? EMPTY_PARAMS,
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
      throw atNavigateToNotFound.type`path must be a string, got ${typeof path}`;
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
      throw atNavigateToNotFound.code(
        errorCodes.ROUTER_NOT_STARTED,
      )`cannot derive the path before the start navigation commits — pass an explicit path`;
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
              atStart.type`a \`start\` interceptor returned without calling next(). Every start interceptor must return \`next(path)\`.`,
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
   * - **Pre-start** (`isPreparing`, #1610) — application code running BEFORE the
   *   first emit. `INVARIANTS.md` row 4 owns the site list and the exclusions;
   *   what belongs here is why the window needs a predicate of its own: the
   *   dispatch depth cannot see it, there has been no emit yet, and without one
   *   a nested `navigate()` runs to completion, commits a phantom
   *   `TRANSITION_SUCCESS`, and shifts the outer transition's `fromState`.
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
      throw atRouter.code(
        errorCodes.REENTRANT_NAVIGATION,
      )`cannot start a navigation from inside a router event listener — the nested navigation would commit a state the outer one overwrites. Defer it: queueMicrotask(() => router.navigate(...)), await the current transition, or use an async listener.`;
    }

    if (this.#navigation.isPreparing()) {
      throw atRouter.code(
        errorCodes.REENTRANT_NAVIGATION,
      )`cannot start a navigation from inside a forwardState interceptor, a route's encodeParams or dynamic forwardTo callback, or a defaultRoute/defaultParams/defaultSearch option callback — they run while a navigation is being prepared, before it is announced. Defer it: queueMicrotask(() => router.navigate(...)).`;
    }

    // ⚠ The THIRD window, with its own sentence for the reason the two above
    // have theirs (#1665): no emit is on the stack and no navigation is being
    // prepared, so both of those texts read as spurious here. Without the
    // refusal the revalidation defers to a navigation that may never commit, and
    // a state on a dropped route then has nothing left to revalidate it (#1759).
    if (this.#routes.isRevalidating()) {
      throw atRouter.code(
        errorCodes.REENTRANT_NAVIGATION,
      )`cannot start a navigation from inside replace()'s revalidation — the revalidation would then defer to a commit that may never happen. Defer it: queueMicrotask(() => router.navigate(...)).`;
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
  throw atRouter.code(
    errorCodes.ROUTER_DISPOSED,
  )`this router is disposed — dispose() is terminal and swapped every method to refuse`;
}

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
function snapshotForwarded(
  name: string,
  params: Params,
  search?: SearchParams,
): [string, Params, SearchParams | undefined] {
  return [name, adoptChannel(params), adoptChannel(search)];
}
