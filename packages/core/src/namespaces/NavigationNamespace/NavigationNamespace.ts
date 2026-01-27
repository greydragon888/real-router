// packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts

import { logger } from "@real-router/logger";
import { getTypeDescription, isNavigationOptions } from "type-guards";

import { events, errorCodes, constants, RouterError } from "@real-router/core";

import { transition } from "../../transition";

import type {
  CancelFn,
  DefaultDependencies,
  DoneFn,
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/types";

const noop = (): void => {};

/**
 * Safely invokes a callback, catching and logging any errors.
 * Prevents user callback errors from crashing the router.
 */
function safeCallback(
  callback: DoneFn,
  ...args: [error?: RouterError, state?: State]
): void {
  try {
    callback(...args);
  } catch (error) {
    logger.error("router.navigate", "Error in navigation callback:", error);
  }
}

/**
 * Result of parsing polymorphic navigate() arguments.
 */
interface ParsedNavigateArgs {
  params: Params;
  opts: NavigationOptions;
  callback: DoneFn;
}

/**
 * Parses the polymorphic arguments of navigate().
 *
 * Handles all valid call signatures:
 * - navigate(name, callback)
 * - navigate(name, params)
 * - navigate(name, params, callback)
 * - navigate(name, params, opts)
 * - navigate(name, params, opts, callback)
 */
function parseNavigateArgs(
  paramsOrDone?: Params | DoneFn,
  optsOrDone?: NavigationOptions | DoneFn,
  done?: DoneFn,
): ParsedNavigateArgs {
  if (typeof paramsOrDone === "function") {
    // Form: navigate(name, callback)
    return { params: {}, opts: {}, callback: paramsOrDone };
  }

  // Forms: navigate(name), navigate(name, params), navigate(name, params, callback),
  //        navigate(name, params, opts), navigate(name, params, opts, callback)
  // Also handles: navigate(name, null/undefined, callback) - runtime defense
  const params = paramsOrDone ?? {};

  if (typeof optsOrDone === "function") {
    return { params, opts: {}, callback: optsOrDone };
  }

  return {
    params,
    opts: optsOrDone ?? {},
    callback: done ?? noop,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLIC DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════
// Navigation → RouterLifecycle.isStarted() (check before navigation)
//
// Solution: functional reference `isRouterStarted`, configured in Router.#setupDependencies()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToState(), and transition state.
 */
export class NavigationNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  // ═══════════════════════════════════════════════════════════════════════════
  // Functional reference for cyclic dependency
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Functional reference to RouterLifecycleNamespace.isStarted().
   * Must be set before calling navigate().
   */

  isRouterStarted!: () => boolean;

  #navigating = false;
  #cancelCurrentTransition: CancelFn | null = null;

  // Router reference for navigation operations (set after construction)
  #router: Router<Dependencies> | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates navigate arguments.
   * Note: Only validates `name` - other args are polymorphic and validated after parsing.
   */
  static validateNavigateArgs(name: unknown): asserts name is string {
    if (typeof name !== "string") {
      throw new TypeError(
        `[router.navigate] Invalid route name: expected string, got ${getTypeDescription(name)}`,
      );
    }
  }

  /**
   * Validates navigateToState arguments.
   */
  static validateNavigateToStateArgs(
    toState: unknown,
    fromState: unknown,
    opts: unknown,
    callback: unknown,
    emitSuccess: unknown,
  ): void {
    // toState must be a valid state object
    if (
      !toState ||
      typeof toState !== "object" ||
      typeof (toState as State).name !== "string" ||
      typeof (toState as State).path !== "string"
    ) {
      throw new TypeError(
        `[router.navigateToState] Invalid toState: expected State object with name and path`,
      );
    }

    // fromState can be undefined or a valid state
    if (
      fromState !== undefined &&
      (!fromState ||
        typeof fromState !== "object" ||
        typeof (fromState as State).name !== "string")
    ) {
      throw new TypeError(
        `[router.navigateToState] Invalid fromState: expected State object or undefined`,
      );
    }

    // opts must be an object
    if (typeof opts !== "object" || opts === null) {
      throw new TypeError(
        `[router.navigateToState] Invalid opts: expected NavigationOptions object, got ${getTypeDescription(opts)}`,
      );
    }

    // callback must be a function
    if (typeof callback !== "function") {
      throw new TypeError(
        `[router.navigateToState] Invalid callback: expected function, got ${getTypeDescription(callback)}`,
      );
    }

    // emitSuccess must be a boolean
    if (typeof emitSuccess !== "boolean") {
      throw new TypeError(
        `[router.navigateToState] Invalid emitSuccess: expected boolean, got ${getTypeDescription(emitSuccess)}`,
      );
    }
  }

  /**
   * Validates navigateToDefault arguments.
   * Note: Arguments are polymorphic - validates what can be checked upfront.
   */
  static validateNavigateToDefaultArgs(
    optsOrDone: unknown,
    done: unknown,
  ): void {
    // If first arg is provided and not a function, it must be an object (options)
    if (
      optsOrDone !== undefined &&
      typeof optsOrDone !== "function" &&
      (typeof optsOrDone !== "object" || optsOrDone === null)
    ) {
      throw new TypeError(
        `[router.navigateToDefault] Invalid options: ${getTypeDescription(optsOrDone)}. Expected NavigationOptions object or callback function.`,
      );
    }

    // If second arg is provided, it must be a function
    if (done !== undefined && typeof done !== "function") {
      throw new TypeError(
        `[router.navigateToDefault] Invalid callback: expected function, got ${getTypeDescription(done)}`,
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for navigation operations.
   * Must be called before using navigation methods.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Checks if a navigation transition is currently in progress.
   */
  isNavigating(): boolean {
    return this.isRouterStarted() && this.#navigating;
  }

  /**
   * Cancels the current transition if one is in progress.
   */
  cancel(): void {
    if (this.#cancelCurrentTransition) {
      this.#cancelCurrentTransition();
      this.#cancelCurrentTransition = null;
    }

    this.#navigating = false;
  }

  /**
   * Internal navigation function that accepts pre-built state.
   * Used by RouterLifecycleNamespace for start() transitions.
   */
  navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ): CancelFn {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
    const router = this.#router!;

    // Warn about concurrent navigation (potential SSR race condition)
    if (this.#navigating) {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use router.clone() to create isolated instance per request.",
      );
    }

    // Cancel previous transition
    this.cancel();

    // Set navigating flag BEFORE emitting TRANSITION_START
    // This ensures isNavigating() returns true during event handlers
    this.#navigating = true;

    // Emit TRANSITION_START (after navigating flag is set)
    router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

    // Create callback for transition
    const transitionCallback = (err: RouterError | undefined, state: State) => {
      this.#navigating = false;
      this.#cancelCurrentTransition = null;

      if (!err) {
        // Route was already validated in navigate() via buildState().
        // Since guards can no longer redirect (Issue #55), the state.name cannot change.
        // However, routes can be dynamically removed during async navigation,
        // so we do a lightweight check with hasRoute() instead of full buildState().
        // UNKNOWN_ROUTE is always valid (used for 404 handling).
        if (
          state.name === constants.UNKNOWN_ROUTE ||
          router.hasRoute(state.name)
        ) {
          router.setState(state);

          // Emit TRANSITION_SUCCESS only if requested
          if (emitSuccess) {
            router.invokeEventListeners(
              events.TRANSITION_SUCCESS,
              state,
              fromState,
              opts,
            );
          }

          // State is already frozen from transition module
          safeCallback(callback, undefined, state);
        } else {
          // Route was removed during async navigation
          const notFoundErr = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
            routeName: state.name,
          });

          safeCallback(callback, notFoundErr);
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            undefined,
            router.getState(),
            notFoundErr,
          );
        }

        return;
      }

      // Error handling
      if (err.code === errorCodes.TRANSITION_CANCELLED) {
        router.invokeEventListeners(
          events.TRANSITION_CANCEL,
          toState,
          fromState,
        );
      } else {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          err,
        );
      }

      safeCallback(callback, err);
    };

    // Launch transition
    this.#cancelCurrentTransition = transition(
      router,
      toState,
      fromState,
      opts,
      transitionCallback,
    );

    return this.#cancelCurrentTransition;
  }

  /**
   * Navigates to a route by name.
   */
  navigate(
    name: string,
    paramsOrDone?: Params | DoneFn,
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
    const router = this.#router!;

    // Parse polymorphic arguments first (needed for callback in error case)
    const { params, opts, callback } = parseNavigateArgs(
      paramsOrDone,
      optsOrDone,
      done,
    );

    // Quick check of the state of the router
    if (!this.isRouterStarted()) {
      const err = new RouterError(errorCodes.ROUTER_NOT_STARTED);

      safeCallback(callback, err);

      return noop;
    }

    // Validate opts after polymorphic argument resolution
    // Note: Empty object {} is valid, but invalid types/fields are rejected
    if (!isNavigationOptions(opts)) {
      throw new TypeError(
        `[router.navigate] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
      );
    }

    // build route state with segments (avoids duplicate getSegmentsByName call)
    const result = router.buildStateWithSegments(name, params);

    if (!result) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND);

      safeCallback(callback, err);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        undefined,
        router.getState(),
        err,
      );

      return noop;
    }

    const { state: route, segments } = result;

    // create a target state
    // Use buildPathWithSegments to avoid duplicate getSegmentsByName in buildPath
    const toState = router.makeState(
      route.name,
      route.params,
      router.buildPathWithSegments(route.name, route.params, segments),
      {
        params: route.meta,
        options: opts,
        redirected: opts.redirected ?? false,
      },
    );

    // Early return for skipTransition - no state equality check needed
    // eslint-disable-next-line @typescript-eslint/no-deprecated,sonarjs/deprecation
    if (opts.skipTransition) {
      // toState is already frozen from makeState()
      safeCallback(callback, undefined, toState);

      return noop;
    }

    const fromState = router.getState();

    // Fast verification for the same states
    if (
      !opts.reload &&
      !opts.force &&
      router.areStatesEqual(fromState, toState, false)
    ) {
      const err = new RouterError(errorCodes.SAME_STATES);

      safeCallback(callback, err);
      router.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        fromState,
        err,
      );

      return noop;
    }

    // transition execution with TRANSITION_SUCCESS emission
    // Note: Guards cannot redirect - redirects are handled in middleware only
    return this.navigateToState(toState, fromState, opts, callback, true); // emitSuccess = true for public navigate()
  }

  /**
   * Navigates to the default route if configured.
   */
  navigateToDefault(
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
    const router = this.#router!;
    const options = router.getOptions();

    if (!options.defaultRoute) {
      return noop;
    }

    let opts: NavigationOptions = {};
    let callback: DoneFn = noop;

    if (typeof optsOrDone === "function") {
      callback = optsOrDone;
    } else if (optsOrDone) {
      opts = optsOrDone;
      callback = done ?? noop;
    }

    // Validate opts for better error messages (specific to navigateToDefault)
    if (!isNavigationOptions(opts)) {
      throw new TypeError(
        `[router.navigateToDefault] Invalid options: ${getTypeDescription(opts)}. Expected NavigationOptions object.`,
      );
    }

    return this.navigate(
      options.defaultRoute,
      options.defaultParams,
      opts,
      callback,
    );
  }
}
