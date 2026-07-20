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
  State,
  StateMetaInput,
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
   * router.navigate('dashboard', {}, { replace: true });
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
   * - Navigation to current route throws SAME_STATES error
   * - No lifecycle hooks execute
   * - No events are fired
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
   * // Refresh current page data
   * router.navigate(currentRoute.name, currentRoute.params, { reload: true });
   *
   * @example
   * // Force re-fetch on same route with different query params
   * // Note: query params are in path, not checked for equality
   * router.navigate('search', { term: 'react' }, { reload: true });
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
   * - Both have identical implementation effect
   *
   * The equality check compares:
   * - state.name (route name)
   * - state.params (route parameters, shallow comparison)
   *
   * @default false
   *
   * @example
   * // Force transition for tracking even if params didn't change
   * router.navigate('analytics', { event: 'pageview' }, { force: true });
   *
   * @see {@link reload} for semantic equivalent (preferred for refresh scenarios)
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
   *   router.navigate('login', {}, {
   *     forceDeactivate: true,
   *     replace: true
   *   });
   * }
   *
   * @see {@link Router.clearCanDeactivate} for programmatically clearing guards
   */
  forceDeactivate?: boolean | undefined;

  /**
   * Internal flag indicating navigation is result of a redirect.
   *
   * @internal
   *
   * @description
   * Automatically set by the router when a navigation is triggered by a redirect.
   * Available on `state.transition` after successful navigation (not during guard execution).
   *
   * @default false (auto-set by router during redirects)
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
  DefaultRouteCallback,
  ForwardToCallback,
  DefaultParamsCallback,
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
