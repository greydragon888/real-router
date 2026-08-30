// Route node types
export type {
  QueryParamsMode,
  QueryParamsOptions,
  RouteParams,
  RouteTreeState,
} from "./route-node-types";

// Base types
export type {
  Params,
  NavigationTarget,
  ParamsSearch,
  SearchParams,
  SearchParamValue,
  SearchParamPrimitive,
  State,
  SimpleState,
  Unsubscribe,
  RouterError,
  TransitionPhase,
  TransitionReason,
  TransitionMeta,
  SerializedRouterState,
} from "./base";

// ---------------------------------------------------------------------------
// Augmentation-target interfaces — DECLARED HERE, not re-exported (#1540).
//
// Plugins augment them via `declare module "@real-router/core/types"`. TS
// merges such an augmentation only when the resolved entry module is the
// interface's lexical declaration-site — a re-export (any form: named,
// star, renamed, single- or two-statement) is a silent no-op (#1519). In
// `dist` this file IS the `types` entry chunk, so declaring the interfaces
// here keeps the merge working for external consumers resolving bundled
// d.mts (the #1520 fold had hoisted them into a shared chunk, silently
// breaking every plugin's context/options typing — #1540). Enforced by
// `scripts/check-dts-augment-targets.mjs` after every bundle.
// ---------------------------------------------------------------------------

/**
 * Empty interface extended by plugins via module augmentation to declare
 * typed `state.context.<namespace>` fields.
 *
 * @description
 * Plugins add typed context namespaces by augmenting this interface:
 *
 * ```typescript
 * declare module "@real-router/core/types" {
 *   interface StateContext {
 *     navigation: { direction: "forward" | "back" | "navigate" };
 *   }
 * }
 * ```
 *
 * After augmentation, `state.context.navigation` becomes typed. The intersection
 * with `Record<string, unknown>` in {@link State.context} keeps the type open,
 * so plugins that don't augment can still write arbitrary namespaces.
 *
 * @see {@link State.context}
 * @see {@link ContextNamespaceClaim}
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extended via module augmentation
export interface StateContext {}

/**
 * Configuration options that control navigation transition behavior.
 *
 * @description
 * NavigationOptions provides fine-grained control over how the router performs navigation
 * transitions. These options affect history management, transition lifecycle execution,
 * guard enforcement, and state comparison logic.
 *
 * All options are optional and have sensible defaults. Options can be combined to achieve
 * complex navigation behaviors. These options are available to guards and event listeners.
 *
 * @see {@link Router.navigate} for navigation method that accepts these options
 */
export interface NavigationOptions {
  /**
   * Replace the current history entry instead of pushing a new one.
   *
   * @description
   * When `true`, the navigation will replace the current entry in browser history instead
   * of adding a new entry. This is typically used by history plugins (browser plugin) to
   * control how navigation affects the browser's back/forward buttons.
   *
   * @default false
   *
   * @example
   * // Redirect after login - prevent back button to login page
   * router.navigate('dashboard', {}, undefined, { replace: true });
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState}
   */
  replace?: boolean | undefined;

  /**
   * Marks a `replace()` state-revalidation emit — a core-set signal, NOT a
   * user-facing navigation option.
   *
   * @description
   * `getRoutesApi(router).replace(...)` revalidates the active state against the
   * new tree and emits `TRANSITION_SUCCESS` (#950). Core sets `revalidate: true`
   * on that emit so a plugin's `onTransitionSuccess(toState, fromState, opts)`
   * can distinguish a revalidation from a real navigation — both otherwise carry
   * `replace: true` and are indistinguishable (#1201). Passing it to
   * `router.navigate(...)` has no effect on the navigation itself.
   *
   * @default undefined
   */
  revalidate?: boolean | undefined;

  /**
   * Force reload of the current route even if states are equal.
   *
   * @description
   * When `true`, bypasses the "same state" check that normally prevents navigation when
   * the target state equals the current state. This forces a full transition lifecycle
   * execution, allowing route components to reload with the same parameters.
   *
   * Without `reload`:
   * - Navigation to current route rejects with `SAME_STATES`
   * - No lifecycle hooks execute
   * - `TRANSITION_ERROR` fires carrying that error — the refusal is announced,
   *   not silent
   *
   * With `reload`:
   * - Full transition executes (deactivate → activate)
   * - All lifecycle hooks run again
   * - TRANSITION_SUCCESS event fires with same state
   * - State object is recreated (new reference)
   *
   * @default false
   *
   * @example
   * // Refresh current page data. Options sit at slot 4 since RFC-4 M2
   * // (#1548) — slot 3 is the query channel, so the pre-M2 three-argument
   * // spelling puts `{ reload: true }` in `search`: the reload never happens
   * // and the page's own query is rebuilt from an object that does not have
   * // it (measured: `/search?term=react` → `/search`).
   * router.navigate(
   *   currentRoute.name,
   *   currentRoute.params,
   *   currentRoute.search,
   *   { reload: true },
   * );
   *
   * @example
   * // Force re-fetch on the same route with a different query. The query is
   * // its own channel now — pass it at slot 3, not inside the path bag.
   * router.navigate('search', {}, { term: 'react' }, { reload: true });
   *
   * @see {@link force} for alternative that forces transition
   * @see {@link Router.areStatesEqual} for state comparison logic
   */
  reload?: boolean | undefined;

  /**
   * Force navigation even if target state equals current state.
   *
   * @description
   * When `true`, bypasses the "same state" equality check but still executes the full
   * transition lifecycle. Similar to `reload` but can be used
   * for any forced navigation scenario.
   *
   * Difference from `reload`:
   * - `reload`: semantic meaning is "refresh current route"
   * - `force`: general-purpose bypass of equality check
   *
   * ⚠ They are NOT interchangeable. Both get past the equality check, and there
   * they part company: only `reload` reaches `state.transition.reload`, and
   * `Router.shouldUpdateNode` reads that FIRST, before it looks at the
   * transition path at all. So under `reload` **every** node answers `true`,
   * while under `force` only the root, the intersection and the nodes the path
   * actually activates or deactivates do. On a same-state navigation that is
   * every node in between — a strict ancestor of the intersection is the
   * clearest case, and the surface is the one every adapter's `useRouteNode`
   * sits on. The truth table is pinned in
   * `tests/functional/routes/shouldUpdateNode.test.ts`; reach for `reload` when
   * mounted components must re-render.
   *
   * The equality check compares:
   * - state.name (route name)
   * - state.params (route parameters, shallow comparison)
   *
   * @default false
   *
   * @example
   * // Force transition for tracking even if params didn't change
   * router.navigate('analytics', {}, { event: 'pageview' }, { force: true });
   *
   * @see {@link reload} — the same bypass plus the meta flag, so it is what a
   * refresh wants; not an equivalent, see the ⚠ above
   */
  force?: boolean | undefined;

  /**
   * Skip canDeactivate guards during transition.
   *
   * @description
   * When `true`, bypasses only the canDeactivate lifecycle hooks for segments being
   * deactivated. canActivate guards still execute normally. This allows
   * forcing navigation away from routes with confirmation dialogs or unsaved changes.
   *
   * Skipped vs executed:
   * ```
   * // Normal transition
   * deactivate(fromSegments) → activate(toSegments) → success
   *
   * // With forceDeactivate: true
   * [skip deactivate] → activate(toSegments) → success
   * ```
   *
   * ⚠️ Data loss risk: Bypassing canDeactivate means unsaved changes will be lost
   *
   * @default false
   *
   * @example
   * // Force logout even with unsaved changes
   * function forceLogout() {
   *   router.navigate('login', {}, undefined, {
   *     forceDeactivate: true,
   *     replace: true
   *   });
   * }
   *
   * @see {@link Router.clearCanDeactivate} for programmatically clearing guards
   */
  forceDeactivate?: boolean | undefined;

  /**
   * Marks a navigation as the result of a redirect. Carried through to
   * `state.transition.redirected` at the commit.
   *
   * ⚠ **The router never sets it.** The only way into the pipeline is this
   * option, so the field is `undefined` after a `forwardTo` redirect and after a
   * guard-driven one alike — a caller (typically a URL plugin routing its own
   * redirect) has to pass `{ redirected: true }`. Whether core should set it is
   * open; today it does not, and code that keys off it will not fire.
   *
   * On the pending target a guard is handed, `state.transition` carries
   * `DEFAULT_TRANSITION` and this flag reads `undefined` there whatever the
   * caller passed — the real value is written at the commit.
   *
   * ⚠ The `?.` in the example below is not decoration. `state.transition` is
   * declared required and every State core BUILDS has it, but `getInternals`
   * is published and the commit door preserves the absence of the field on a
   * State an application hands it (#1792) — so a listener can be called with a
   * committed state that has none.
   *
   * @default undefined
   *
   * @example
   * // Accessing redirect flag in TRANSITION_SUCCESS listener
   * router.addEventListener('TRANSITION_SUCCESS', (state) => {
   *   if (state.transition?.redirected) {
   *     console.log('This navigation is from a redirect');
   *   }
   * });
   *
   * @see {@link Router.navigate} for redirect handling implementation
   * @see {@link NavigationOptions.redirected} for the input mechanism
   */
  redirected?: boolean | undefined;

  /**
   * Optional abort signal for cancelling the navigation.
   *
   * @description
   * When provided, this signal can be used to cancel the navigation operation.
   * If the signal is aborted, the navigation will be cancelled and any pending
   * guards or transitions will be interrupted.
   *
   * @default undefined
   */
  signal?: AbortSignal | undefined;
}

// Router types, factory types, and route config types
export type {
  Router,
  Navigator,
  Route,
  Plugin,
  Listener,
  Options,
  AnyOptions,
  DefaultRouteCallback,
  ForwardToCallback,
  DefaultParamsCallback,
  DefaultSearchCallback,
  GuardFn,
  DefaultDependencies,
  SubscribeState,
  SubscribeFn,
  LeaveState,
  LeaveFn,
  Subscription,
  PluginFactory,
  GuardFnFactory,
  RouteConfigUpdate,
  RouterLogger,
  LoggerConfig,
  LogLevel,
  LogLevelConfig,
  LogCallback,
} from "./router";

// Limits configuration
export type { LimitsConfig } from "./limits";

export type {
  PluginMethod,
  EventName,
  EventsKeys,
  ErrorCodeValues,
  ErrorCodeKeys,
  EventToPluginMap,
  EventToNameMap,
  ErrorCodeToValueMap,
  EventMethodMap,
} from "./constants";

// API interfaces (modular router access)
export type {
  PluginApi,
  RoutesApi,
  DependenciesApi,
  LifecycleApi,
  InterceptableMethodMap,
  InterceptorFn,
  ContextNamespaceClaim,
} from "./api";

// Route-tree mutation event (observed via getRoutesApi().subscribeChanges)
export type {
  TreeChangedEvent,
  TreeChangedAdd,
  TreeChangedRemove,
  TreeChangedUpdate,
  TreeChangedReplace,
  TreeChangedClear,
  TreeStructuralPatch,
} from "./tree-changed";

// Note: RouterError type is a forward declaration matching the class in real-router package
// Use import { RouterError } from "real-router" for the actual class implementation
