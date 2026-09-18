/**
 * API interfaces for modular router access.
 * These interfaces are implemented by standalone API functions in @real-router/core.
 */

import type {
  Params,
  SearchParams,
  State,
  SimpleState,
  Unsubscribe,
} from "./base";
import type { EventMethodMap, EventName } from "./constants";
// Augment-target interfaces are declared lexically in the entry (#1540); the
// type-only cycle with the barrel is deliberate — see the note in ./index.
import type { NavigationOptions, StateContext } from "./index";
import type { LimitsConfig } from "./limits";
import type {
  AdoptedOrigins,
  DefaultDependencies,
  GuardFnFactory,
  Plugin,
  Route,
  RouteConfigUpdate,
  RouterLogger,
  AnyOptions,
} from "./router";
import type { TreeChangedEvent } from "./tree-changed";

/**
 * Maps interceptable method names to their signatures.
 * Used by {@link PluginApi.addInterceptor} to provide type-safe interceptor registration.
 *
 * ⚠ **Position is the design question, not membership.** A seam BELOW the
 * route-default merge lets a plugin reach the printed URL and not
 * `state.search`, which is the divergence #1938 retired one for. Whatever is
 * added here has to sit above the merge, and `seam-coverage-authority-1938`
 * must be able to say which doors run it.
 *
 * To add one:
 * 1. Add its signature here — `SEAM` in `internals.ts` fails to compile until
 *    it carries the same key, in both directions
 * 2. Wrap it with `createInterceptable()` / `createTernaryInterceptable()` in
 *    the `registerInternals` block of the Router constructor
 *    (`packages/core/src/Router.ts`)
 */
export interface InterceptableMethodMap {
  start: (path?: string) => Promise<State>;
  forwardState: (
    routeName: string,
    routeParams: Params,
    routeSearch?: SearchParams,
  ) => SimpleState;
}

/**
 * Every position at which core asks whether anyone OBJECTS, and the values it
 * hands the question (#2388).
 *
 * ⚑ **A position is not a seam, and the difference is the right it hands out.**
 * An interceptor receives `next` and may call it with other arguments, or not at
 * all — it REPLACES behaviour. A check receives values and may only throw: it
 * cannot alter what core does next, only stop it. Measured across the six
 * shipped `addInterceptor` sites outside core, not one of them refuses, and not
 * one of the validator's refusals replaces; the two rights are disjoint in
 * practice, so they are disjoint in the API.
 *
 * ⚑ **What refuses a position: a consultation standing at it.** A name lands
 * here when shipped code asks the question there, never because a door looks
 * like it might want one — an eligible-looking position with no consultation is
 * how a vocabulary grows by default rather than by decision (core/CLAUDE.md
 * › _Before adding an aggregating entity_). A refusal has been recorded:
 * `buildPath`'s ENTRY is eligible and absent, because the consultation standing
 * there mixes a refusal with a diagnostic and a diagnostic is not this
 * channel's to carry.
 *
 * ⚠ The map's VALUE is the argument tuple, so a check registered at a position
 * is typed by what that position judges rather than by the door's signature.
 */
export interface CheckPositionMap {
  /**
   * The bag core adopted from the caller's, and prints the path from (#2134).
   *
   * ⚑ The case an interceptor cannot express: at the call boundary this object
   * does not exist yet, so a seam could only judge the caller's bag — and a key
   * that answers differently per read is admitted on the one that SHIPS.
   *
   * ⚠ `undefined` when the caller passed no bag: `adoptChannel` is identity on
   * the type, so "no params" survives the copy rather than becoming an empty
   * object. A check here judges absence as well as content.
   */
  "buildPath:params": [ownParams: Params | undefined];

  /**
   * The same judgement for the printer a caller reaches having ALREADY resolved
   * the forward chain (`PluginApi.buildPathResolved`).
   *
   * ⚠ A separate position rather than a shared one, because the value a check
   * refuses names its own door in the message. The two printers are reached
   * independently — the href door runs the chain itself and comes here — so a
   * refusal naming the wrong one sends the reader to a call that did not happen.
   */
  "buildPathResolved:params": [ownParams: Params | undefined];

  /**
   * `canNavigateTo`'s arguments, as the caller spelled them.
   *
   * ⚠ This door is documented TOTAL in bare core (INVARIANTS `canNavigateTo`
   * #5), and a check here can throw. That divergence is the analyser's to own,
   * not this position's: it is the same shape the door already had when the
   * validator answered here, and `predicate-totality-2245.test.ts` pins both
   * arms.
   */
  "canNavigateTo:entry": [
    name: string,
    params: Params | undefined,
    search: SearchParams | undefined,
  ];

  /** The copy the predicate answers about, for the reason above `buildPath:params`. */
  "canNavigateTo:params": [ownParams: Params | undefined];

  /**
   * `navigate`'s arguments AFTER the two call shapes are unpacked, so a check
   * sees one spelling whether the caller passed a name or a target object.
   *
   * ⚠ `options` is never absent here: core substitutes its own `EMPTY_OPTS`
   * singleton when the caller passes none, so a check judges that object rather
   * than `undefined`.
   */
  "navigate:entry": [
    routeName: string,
    routeParams: Params | undefined,
    search: SearchParams | undefined,
    options: NavigationOptions,
  ];

  /**
   * The copy the whole navigation runs on (#2134).
   *
   * ⚠ Reached only when `adoptChannel` did not throw — a caller's accessor that
   * throws becomes a REJECTION one line above, because everything this door
   * answers with is a promise.
   */
  "navigate:params": [ownParams: Params | undefined];
}

/**
 * A check: it may THROW, and its return value is ignored by construction.
 *
 * ⚠ `void` rather than `boolean` is deliberate — a boolean would make silence
 * ambiguous (did it pass, or did the check forget to return?) and would tempt a
 * caller to treat the channel as a predicate. Refusal has exactly one spelling.
 */
export type CheckFn<P extends keyof CheckPositionMap> = (
  ...args: CheckPositionMap[P]
) => void;

/**
 * Type-safe interceptor callback.
 * Receives `next` (the next function in the chain) followed by the method's original parameters.
 */
export type InterceptorFn<M extends keyof InterceptableMethodMap> = (
  next: InterceptableMethodMap[M],
  ...args: Parameters<InterceptableMethodMap[M]>
) => ReturnType<InterceptableMethodMap[M]>;

/**
 * Writer object returned by {@link PluginApi.claimContextNamespace}. Holds
 * exclusive ownership of a single `state.context.<namespace>` key for the
 * lifetime of the owning plugin.
 *
 * @description
 * A plugin obtains a claim by calling `api.claimContextNamespace("ns")` at
 * registration, then publishes per-navigation data via {@link write} from a
 * lifecycle hook (typically `onTransitionSuccess`) or from an interceptor.
 * The plugin must call {@link release} in its `teardown()` so another plugin
 * can reclaim the same namespace.
 *
 * The core runtime enforces one invariant, from both sides. A namespace can be
 * held by at most one claim at a time — double-claiming throws
 * `CONTEXT_NAMESPACE_ALREADY_CLAIMED` — and a claim acts only while it is the
 * holder, so {@link write} and {@link release} are both no-ops once the claim
 * has been released.
 *
 * @example
 * ```typescript
 * const navigationPlugin: PluginFactory = (router) => {
 *   const api = getPluginApi(router);
 *   const claim = api.claimContextNamespace("navigation");
 *
 *   return {
 *     onTransitionSuccess(toState, fromState) {
 *       claim.write(toState, { direction: detectDirection(fromState, toState) });
 *     },
 *     teardown() {
 *       claim.release();
 *     },
 *   };
 * };
 * ```
 *
 * @see {@link PluginApi.claimContextNamespace}
 * @see {@link State.context}
 */
export interface ContextNamespaceClaim<T = unknown> {
  write: (state: State, value: T) => void;
  release: () => void;
}

/**
 * Plugin API — for plugins and infrastructure packages.
 * Hides plugin-internal methods from public autocomplete.
 */
export interface PluginApi {
  makeState: <P extends Params = Params, S extends SearchParams = SearchParams>(
    name: string,
    params?: P,
    search?: S,
    path?: string,
  ) => State<P, S>;

  forwardState: <
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    routeName: string,
    routeParams: P,
    routeSearch?: S,
  ) => SimpleState<P, S>;

  matchPath: <P extends Params = Params>(path: string) => State<P> | undefined;

  /**
   * Where each adopted default bag came from, weakly (#2148).
   *
   * ⚠ An ALIAS of the internals member rather than a call, and the reason is
   * measured: a call makes it a DISTINCT pair for the parity ledger, which
   * requires a hostile-input vector per pair — and this member takes no
   * arguments, so that vector could only be vacuous. Nothing stubs it either,
   * which is the condition `plugin-api-stub-seam-authority-1805` attaches to
   * the call form.
   */
  getAdoptedOrigins: () => AdoptedOrigins;

  /**
   * Navigate to a fully-built `State`, skipping the redundant
   * `forwardState`/`buildPath` round-trip in `buildNavigateState`.
   *
   * Plugin-only entry point for browser-initiated navigation: a plugin
   * receives a URL event, resolves it via `api.matchPath(url)`, then commits
   * the resulting `State` directly via `api.navigateToState(state, opts)`.
   *
   * Semantics vs `router.navigate(name, params, opts)`:
   * - `forwardState` is NOT re-applied (matchPath already ran it).
   * - The URL is NOT re-printed; `state.path` is used verbatim, preserving
   *   `trailingSlash:"preserve"` source-URL output. ⚑ It may therefore belong
   *   to a route OTHER than `state.name`: the pair is authoritative as handed,
   *   and neither half is derived from the other. INVARIANTS "forwardState /
   *   Route Forwarding" row 9 owns the shapes core commits that way.
   * - `forwardState` interceptors do NOT run on this path; the URL the user
   *   navigated to is the source of truth.
   * - Pipeline: SAME_STATES check, FSM transition, guards, `subscribeLeave`,
   *   `completeTransition`, plugin lifecycle hooks — all unchanged.
   * - The STATE you pass is not the state that gets committed (#1792). Both
   *   channels are copied into the router's own FROZEN bags, so
   *   `getState().params !== yourBag`, writing into it throws, and
   *   `undefined`-valued and symbol-keyed entries are dropped. `context` is
   *   copied too but stays MUTABLE — it is the documented carve-out plugins
   *   write to, so nothing is dropped from it and writing into it does not
   *   throw; what changes is that it is the router's object, not yours. A later
   *   mutation of anything you handed in no longer reaches committed state.
   *   `state.path` is the exception above — used verbatim.
   *
   * Programmatic / userland navigation should keep using
   * `router.navigate(name, params, opts)` so interceptors apply.
   */
  navigateToState: (
    state: State,
    options?: NavigationOptions,
  ) => Promise<State>;

  /**
   * Sets the root path prefix. Returns whether it APPLIED — `false` when it was
   * refused because a navigation is in flight and the root's PATH half would
   * move (#1755). A `teardown()` cannot wait for the navigation to settle, so it
   * needs the answer; every other caller may ignore it.
   */
  setRootPath: (rootPath: string) => boolean;
  getRootPath: () => string;

  /**
   * A three-method VIEW of the router's logger, frozen and built once.
   *
   * ⚠ Not the logger instance. The class behind this interface also carries
   * `configure`, which would let any holder re-aim or silence this router's
   * logging for every consumer at once — and the instance is not frozen, so a
   * write to `warn` would land for all of them (#1805).
   */
  logger: RouterLogger;

  /**
   * The route's DECLARED query names minus its path slots — the registry that
   * decides which CHANNEL owns a key (#1556), with the `/items/:id?id` carve-out
   * falling out of the subtraction. Answers `[]` for a route the tree does not
   * hold; a name is not a claim that the route exists.
   *
   * ⚠ **The array is handed out BY REFERENCE and does not track the tree
   * (#2255).** Cache the handle and a later `replace()` leaves you holding a
   * frozen array that describes the old declaration — it does not throw, empty
   * or warn. Call the door again after a tree change, or do not hold it.
   *
   * ⚑ An unknown name costs nothing to ask: since #2347 that arm answers the
   * shared frozen empty WITHOUT a cache write, so a caller-controlled name
   * cannot grow the registry.
   */
  getDeclaredQueryNames: (name: string) => readonly string[];

  /**
   * The route's PATH slot names, ancestors included. Answers `[]` for a route
   * the tree does not hold; a name is not a claim that the route exists.
   *
   * ⚠ **Not the full set `buildPath` requires.** A root path carrying slots —
   * `setRootPath("/app/:tenant")` — prefixes every URL, so `buildPath` demands
   * `tenant` while this answers the route's own chain alone. Measured: a route
   * declaring `:id` under that root answers `["id"]` and builds only when
   * `tenant` is supplied too.
   *
   * ⚠ Handed out BY REFERENCE and frozen where it lives, with the same caveat as
   * {@link getDeclaredQueryNames}: a held array describes the tree as it was
   * when read, and a rebuild mints a new one (#2255).
   */
  getUrlParams: (name: string) => readonly string[];

  /**
   * The ONE-HOP forward map — each source route's STRING `forwardTo` target; a
   * callback `forwardTo` is not in it — as a fresh frozen copy per call.
   *
   * ⚠ **One hop, not resolved.** A consumer that checks a PENDING forward for
   * cycles overlays it onto this map and resolves the chain itself. A resolved
   * map collapses each chain to its last hop, so a cycle closing through a
   * source that ALREADY forwards is not constructible there, and the check
   * would miss it silently. `resolveForwardChain` takes exactly this shape.
   *
   * ⚑ A copy, so writing to it reaches nothing — and frozen, so the write does
   * not land either; strict-mode code (every ES module) gets a `TypeError`.
   */
  getForwardMap: () => Readonly<Record<string, string>>;

  /**
   * The resolved limits: the caller's `limits` over core's defaults, each
   * coerced to a number once at construction. The frozen object core's own
   * dependency-count check reads, handed out by reference.
   */
  getResolvedLimits: () => Readonly<LimitsConfig>;

  /**
   * The dependency names the router holds, as `Object.keys` lists them —
   * `"__proto__"` included, a symbol key not. A fresh frozen array per call.
   *
   * ⚠ Not `Object.keys(getDependenciesApi(router).getAll())`: that container
   * withholds `"__proto__"`, so a count taken from it comes out one short.
   */
  getDependencyKeys: () => readonly string[];

  /**
   * Route names carrying a guard added through `addActivateGuard` /
   * `addDeactivateGuard` — deactivate first, each name once, including names
   * the route tree does not hold. A fresh frozen array per call.
   *
   * ⚠ A guard declared on a route definition does not put its name here.
   */
  getExternalGuardNames: () => readonly string[];

  addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  /**
   * Builds the State `navigate` would commit, without committing it: resolves
   * `forwardTo`, checks existence (`undefined` = unknown route) and merges the
   * route defaults.
   *
   * `search` is the query channel (#1571). It was the ONE pipeline entry point
   * without the slot — `navigate` / `buildPath` / `canNavigateTo` /
   * `isActiveRoute` / `makeState` all take one — so a query intent could only
   * be spelled by riding declared keys in the `params` bag. An explicit value
   * beats such a twin, matching the other five.
   */
  buildNavigationState: (
    name: string,
    params?: Params,
    search?: SearchParams,
  ) => State | undefined;

  /**
   * Prints a path for an intent you have ALREADY resolved, without running the
   * `forwardState` chain again (#2260).
   *
   * Use it when you have just called `forwardState` yourself and want the URL
   * for what it returned — building an `href` is the case this exists for.
   * `router.buildPath` runs the chain one door lower (#2087), which is right
   * for a caller holding a RAW intent and a second pass for one holding a
   * resolved one; a plugin's interceptor should see one pass per operation.
   *
   * Identical to `router.buildPath` in every other respect: the route's
   * `defaultParams` / `defaultSearch` are merged, `forwardTo` is NOT resolved
   * (that is what you already did), and an unprintable intent throws the same
   * error from the same place.
   */
  buildPathResolved: (
    name: string,
    params?: Params,
    search?: SearchParams,
  ) => string;

  getOptions: () => AnyOptions;

  getTree: () => unknown;

  addInterceptor: <M extends keyof InterceptableMethodMap>(
    method: M,
    fn: InterceptorFn<M>,
  ) => Unsubscribe;

  /**
   * Registers a REFUSAL at a named position (#2388).
   *
   * The check runs where core chose, receives what that position judges, and may
   * throw. It cannot replace an argument, skip the call, or change an answer —
   * for those there is {@link addInterceptor}, and the two seams it carries are
   * the ones with shipped consumers that genuinely replace.
   *
   * ⚠ Checks at one position run in registration order, and the FIRST throw
   * wins: core does not collect refusals, because the caller gets one error and
   * a second check's opinion about a value already refused is not actionable.
   */
  addCheck: <P extends keyof CheckPositionMap>(
    position: P,
    check: CheckFn<P>,
  ) => Unsubscribe;

  extendRouter: (extensions: Record<string, unknown>) => Unsubscribe;

  /**
   * Emits a `$$error` event without going through the navigation pipeline.
   *
   * Used by plugins that detect an error outside a running transition (e.g.,
   * an unmatched URL on popstate in strict mode). The event reaches any
   * `onTransitionError` plugin hook and any `$$error` listener so developers
   * can observe errors raised by the plugin layer.
   *
   * The current router state is used as `fromState`; `toState` is `undefined`
   * because no transition was attempted. Safe to call at any FSM state — it is
   * a REPORT to observers, not a machine failure, so it emits `TRANSITION_ERROR`
   * directly and never sends `FAIL` (channel (b); the plugin does not know, and
   * must not decide, whether a transition is in flight).
   */
  emitTransitionError: (error: Error) => void;

  claimContextNamespace: {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- StateContext is an empty interface extended via module augmentation, so `keyof StateContext & string` is `never` at baseline and resolves to the augmented keys when plugins extend it
    <K extends keyof StateContext & string>(
      namespace: K,
    ): ContextNamespaceClaim<StateContext[K]>;
    (namespace: string): ContextNamespaceClaim;
  };

  /**
   * The route's custom-field record — the keys `Route` does not declare.
   *
   * ⚠ **This IS the live store record, not a copy.** A write is permanent router
   * config that every other plugin sees, and the record is shared **both ways**
   * with every `cloneRouter` clone: a write on a clone lands in the base and in
   * every sibling clone, including per-request scopes, and it outlives
   * `scope.dispose()` (#1958). Memoising a compiled artefact onto the record you
   * just read (`config.compiled ??= compile(config.schema)`) is the natural way to
   * reach this by accident; the shipped plugins keep such caches in their own
   * `Map`s.
   *
   * ⚠ The RECORD is replaced on `update()` (clone-on-first-write), so a held
   * reference goes stale — the values you wrote survive into the new record, but
   * further writes through the old one reach nobody. The clone-on-write is one
   * level deep: a nested value stays shared even after it fires.
   */
  getRouteConfig: (name: string) => Record<string, unknown> | undefined;
}

/**
 * Routes API — for dynamic route mutation.
 */
export interface RoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  add: (
    routes: Route<Dependencies>[] | Route<Dependencies>,
    options?: { parent?: string },
  ) => void;

  remove: (name: string) => void;

  /**
   * Patch an existing route's configuration in place (no tree rebuild).
   *
   * Applies the structural/guard fields and any plugin-defined custom fields
   * (lifecycle hooks, `preload`, `searchSchema`, …) from the patch. Fields are
   * shallow-merged by key; `null` removes a field, `undefined` is a no-op.
   * `name`/`path`/`children` are immutable — use `remove` + `add` to
   * restructure. See {@link RouteConfigUpdate} for the full semantics and the
   * plugin augmentation pattern.
   */
  update: (name: string, updates: RouteConfigUpdate<Dependencies>) => void;

  clear: () => void;

  replace: (routes: Route<Dependencies>[] | Route<Dependencies>) => void;

  has: (name: string) => boolean;

  /**
   * The route as registered, or `undefined`.
   *
   * ⚠ **A fresh shell over core's own snapshot.** The shell is rebuilt on every
   * call, so `route.path = …` is inert and `get(n) !== get(n)`. One level down
   * is core's snapshot taken at registration — not the object the caller passed
   * — and it is FROZEN, so a write throws rather than reaching the router
   * (#2172).
   *
   * ```ts
   * const route = routes.get("user");
   * route.defaultParams.locale = "de"; // TypeError; routing is unchanged
   * ```
   *
   * ⚑ The guard FACTORIES are the exception and stay the caller's own functions
   * — a function is not snapshotted, so whatever it closes over is still the
   * caller's.
   *
   * To change a default, go through `update()`: it replaces the SLOT, which is
   * also what de-aliases it from a `cloneRouter` clone (#1958).
   *
   * ⚠ Two slots do not follow the rule. `encodeParams` / `decodeParams` come back
   * as the store's WRAPPER, never the caller's function; and custom fields are not
   * here at all — `get(n).myField` is `undefined` while
   * {@link PluginApi.getRouteConfig} returns it. The two doors are complementary
   * views of one route, not a subset and a superset.
   */
  get: (name: string) => Route<Dependencies> | undefined;

  /**
   * Subscribe to structural route-tree mutations (`add` / `remove` / `update`
   * with structural fields / `replace` / `clear`). Fire-and-forget: the handler
   * cannot cancel the mutation, runs after the atomic commit, and sees the
   * post-mutation tree via `get()` / `has()`.
   *
   * Duplicate-registration semantics are **lenient** (mirrors
   * `router.subscribe`): each call registers an independent listener and
   * returns its own unsubscribe.
   *
   * @returns Unsubscribe function for this specific registration.
   */
  subscribeChanges: (
    handler: (event: TreeChangedEvent<Dependencies>) => void,
  ) => Unsubscribe;
}

/**
 * Dependencies API — CRUD for dependency injection.
 */
export interface DependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  get: <K extends keyof Dependencies>(key: K) => Dependencies[K];
  getAll: () => Partial<Dependencies>;
  set: <K extends keyof Dependencies & string>(
    name: K,
    value: Dependencies[K],
  ) => void;
  setAll: (deps: Dependencies) => void;
  remove: (name: keyof Dependencies) => void;
  reset: () => void;
  has: (name: keyof Dependencies) => boolean;
}

/**
 * Lifecycle API — guard registration (addActivateGuard, addDeactivateGuard, etc.)
 */
export interface LifecycleApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  addActivateGuard: (
    name: string,
    canActivateHandler: GuardFnFactory<Dependencies> | boolean,
  ) => void;
  addDeactivateGuard: (
    name: string,
    canDeactivateHandler: GuardFnFactory<Dependencies> | boolean,
  ) => void;
  removeActivateGuard: (name: string) => void;
  removeDeactivateGuard: (name: string) => void;
}
