// Note: RouteTreeState is exported from route-node-types.ts
// It uses RouteParams as default type parameter.
// Real Router code should use RouteTreeState<Params> when needed.

/**
 * Detach function returned by subscription APIs.
 *
 * @description
 * Calling this function removes the associated listener. Returned by
 * `router.subscribe()`, `router.addEventListener()`, `router.subscribeLeave()`,
 * and plugin interceptors. Idempotent — calling more than once is safe and
 * has no additional effect after the first call.
 */
export type Unsubscribe = () => void;

export interface SimpleState<P extends Params = Params> {
  name: string;
  params: P;
}

export type TransitionPhase = "deactivating" | "activating";

export type TransitionReason = "success" | "blocked" | "cancelled" | "error";

export interface TransitionMeta {
  phase: TransitionPhase;
  reason: TransitionReason;
  reload?: boolean;
  redirected?: boolean;
  from?: string;
  blocker?: string;
  segments: {
    deactivated: string[];
    activated: string[];
    intersection: string;
  };
}

/**
 * Empty interface extended by plugins via module augmentation to declare
 * typed `state.context.<namespace>` fields.
 *
 * @description
 * Plugins add typed context namespaces by augmenting this interface:
 *
 * ```typescript
 * declare module "@real-router/types" {
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

export interface State<P extends Params = Params> {
  name: string;
  params: P;
  path: string;
  transition: TransitionMeta;
  /**
   * Plugin-extensible per-route data, attached by plugins via
   * `PluginApi.claimContextNamespace()` + `claim.write(state, value)`.
   *
   * @description
   * Required field — always present as at least `{}` on every State created by
   * the router (via `makeState`, `navigateToNotFound`, or `cloneRouter`).
   *
   * Typed extensions come from plugins augmenting {@link StateContext} through
   * module augmentation. The intersection with `Record<string, unknown>` allows
   * untyped namespaces (inline plugins, tests, or plugins that skip augmentation)
   * to write without compile errors.
   *
   * The `context` object itself is **not frozen** — this is intentional, so
   * plugins can attach data without cloning state. Core structural fields
   * (`name`, `params`, `path`, `transition`) remain immutable via shallow
   * `Object.freeze(state)`.
   *
   * @see {@link StateContext}
   */
  context: StateContext & Record<string, unknown>;
}

export interface StateMetaInput<P extends Params = Params> {
  params: P;
}

/**
 * RouterError interface describing the public API of the RouterError class.
 * The actual class implementation is in the real-router package.
 * This interface enables structural typing compatibility between
 * core-types and real-router packages.
 */
export interface RouterError extends Error {
  [key: string]: unknown;
  readonly code: string;
  readonly segment: string | undefined;
  readonly path: string | undefined;
  readonly redirect: State | undefined;
  setCode: (code: string) => void;
  setErrorInstance: (err: Error) => void;
  setAdditionalFields: (fields: Record<string, unknown>) => void;
  hasField: (key: string) => boolean;
  getField: (key: string) => unknown;
  toJSON: () => Record<string, unknown>;
}

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

export interface Params {
  [key: string]:
    | string
    | string[]
    | number
    | number[]
    | boolean
    | boolean[]
    | Params
    | Params[]
    | Record<string, string | number | boolean>
    | null
    | undefined;
}
