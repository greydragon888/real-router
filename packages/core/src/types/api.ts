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
import type {
  DefaultDependencies,
  GuardFnFactory,
  Plugin,
  Route,
  RouteConfigUpdate,
  AnyOptions,
} from "./router";
import type { TreeChangedEvent } from "./tree-changed";

/**
 * Maps interceptable method names to their signatures.
 * Used by {@link PluginApi.addInterceptor} to provide type-safe interceptor registration.
 *
 * To add a new interceptable method:
 * 1. Add its signature here
 * 2. Wrap it with `createInterceptable()` / `createTernaryInterceptable()` in
 *    the `registerInternals` block of the Router constructor
 *    (`packages/core/src/Router.ts`)
 */
export interface InterceptableMethodMap {
  start: (path?: string) => Promise<State>;
  buildPath: (route: string, params?: Params, search?: SearchParams) => string;
  forwardState: (
    routeName: string,
    routeParams: Params,
    routeSearch?: SearchParams,
  ) => SimpleState;
}

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
 * The core runtime enforces one invariant: a namespace can be held by at most
 * one claim at a time. Double-claiming throws `CONTEXT_NAMESPACE_ALREADY_CLAIMED`.
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
   * Navigate to a fully-built `State`, skipping the redundant
   * `forwardState`/`buildPath` round-trip in `buildNavigateState`.
   *
   * Plugin-only entry point for browser-initiated navigation: a plugin
   * receives a URL event, resolves it via `api.matchPath(url)`, then commits
   * the resulting `State` directly via `api.navigateToState(state, opts)`.
   *
   * Semantics vs `router.navigate(name, params, opts)`:
   * - `forwardState` is NOT re-applied (matchPath already ran it).
   * - `buildPath` is NOT re-run; `state.path` is used verbatim, preserving
   *   `trailingSlash:"preserve"` source-URL output.
   * - `forwardState`/`buildPath` interceptors do NOT run on this path; the
   *   URL the user navigated to is the source of truth.
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

  getOptions: () => AnyOptions;

  getTree: () => unknown;

  addInterceptor: <M extends keyof InterceptableMethodMap>(
    method: M,
    fn: InterceptorFn<M>,
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
   * directly and never sends `FAIL` (channel (б); the plugin does not know, and
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
   * ⚠ **A fresh shell over the caller's own objects.** The shell is rebuilt on
   * every call, so `route.path = …` is inert and `get(n) !== get(n)`. One level
   * down it is not a view at all: `defaultParams`, `defaultSearch` and the guard
   * factories ARE the objects passed at registration, shared with the live store
   * and with every `cloneRouter` clone (#1958).
   *
   * ```ts
   * const route = routes.get("user");
   * route.defaultParams.locale = "de"; // routing has ALREADY changed, everywhere
   * routes.update("user", route);      // a rejected update does not undo it
   * ```
   *
   * ⚠ A **shallow** copy does not isolate you — `{ ...route.defaultParams }`
   * leaves the level below shared — and `update()` is not an escape hatch either:
   * it replaces the SLOT (which does de-alias it from clones) while its
   * clone-on-write is one level deep. Copy deeply, or treat the result as frozen.
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
