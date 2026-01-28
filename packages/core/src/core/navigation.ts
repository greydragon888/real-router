// packages/real-router/modules/core/navigation.ts

import { logger } from "@real-router/logger";
import { getTypeDescription, isNavigationOptions } from "type-guards";

import { events, errorCodes, constants } from "../constants";
import { RouterError } from "../RouterError";

import { transition } from "../namespaces/NavigationNamespace/transition";

import type {
  CancelFn,
  DoneFn,
  NavigationOptions,
  Params,
  State,
  DefaultDependencies,
  Router,
} from "@real-router/types";

const noop = () => {};

/**
 * Safely invokes a callback, catching and logging any errors.
 * Prevents user callback errors from crashing the router.
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
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

export function withNavigation<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  let cancelCurrentTransition: CancelFn | null = null;
  let navigating = false;

  // Cancel of the previous transition
  const cancel = (): Router<Dependencies> => {
    if (cancelCurrentTransition) {
      cancelCurrentTransition();
      cancelCurrentTransition = null;
    }

    navigating = false;

    return router;
  };

  /**
   * Internal navigation function that accepts pre-built state
   *
   * @internal
   */
  const navigateToState = (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ): CancelFn => {
    // Warn about concurrent navigation (potential SSR race condition)
    if (navigating) {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use router.clone() to create isolated instance per request.",
      );
    }

    // Cancel previous transition
    cancel();

    // Set navigating flag BEFORE emitting TRANSITION_START
    // This ensures isNavigating() returns true during event handlers
    navigating = true;

    // Emit TRANSITION_START (after navigating flag is set)
    router.invokeEventListeners(events.TRANSITION_START, toState, fromState);

    // Create callback for transition
    const transitionCallback = (err: RouterError | undefined, state: State) => {
      navigating = false;
      cancelCurrentTransition = null;

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
    cancelCurrentTransition = transition(
      router,
      toState,
      fromState,
      opts,
      transitionCallback,
    );

    return cancelCurrentTransition;
  };

  router.navigate = function navigate(
    name: string,
    paramsOrDone?: Params | DoneFn,
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
    // Parse polymorphic arguments first (needed for callback in error case)
    const { params, opts, callback } = parseNavigateArgs(
      paramsOrDone,
      optsOrDone,
      done,
    );

    // Quick check of the state of the router
    if (!router.isStarted()) {
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

    const { state: route } = result;

    // create a target state
    const toState = router.makeState(
      route.name,
      route.params,
      router.buildPath(route.name, route.params),
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
    // Use router.navigateToState instead of local variable to allow mocking in tests
    // Note: Guards cannot redirect - redirects are handled in middleware only
    return router.navigateToState(toState, fromState, opts, callback, true); // emitSuccess = true for public navigate()
  };

  router.navigateToDefault = function navigateToDefault(
    optsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ): CancelFn {
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

    return router.navigate(
      options.defaultRoute,
      options.defaultParams,
      opts,
      callback,
    );
  };

  // Expose internal navigation for use by plugins and lifecycle
  router.navigateToState = navigateToState;

  /**
   * Checks if a navigation transition is currently in progress.
   *
   * @returns true if navigation is active, false otherwise
   *
   * @example
   * if (router.isNavigating()) {
   *   console.log('Navigation in progress...');
   * }
   *
   * @remarks
   * After FSM migration (RFC-2), this will be replaced with:
   * `router.getRouterState() === RouterState.TRANSITIONING`
   */
  router.isNavigating = (): boolean => router.isStarted() && navigating;

  return router;
}
