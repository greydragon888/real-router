// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { logger } from "@real-router/logger";
import { isState } from "type-guards";

import { errorCodes, events, RouterError } from "@real-router/core";

import type {
  CancelFn,
  DefaultDependencies,
  DoneFn,
  NavigationOptions,
  Params,
  Router,
  RouterError as RouterErrorType,
  State,
} from "@real-router/types";

const noop = (): void => {};

// =============================================================================
// Cached Errors (Performance Optimization)
// =============================================================================
// Pre-create error instances to avoid object allocation on hot paths.
// Error creation involves: new object, stack trace capture (~500ns-2μs).
// Cached errors skip this overhead entirely.
//
// Trade-off: All error instances share the same stack trace (points here).
// This is acceptable because:
// 1. These errors indicate user misconfiguration, not internal bugs
// 2. Error code and message are sufficient for debugging
// 3. Performance gain (~80% for error paths) outweighs stack trace loss
// =============================================================================

/**
 * Cached error for start() called without path/state and no defaultRoute.
 */
const CACHED_NO_START_PATH_ERROR = new RouterError(
  errorCodes.NO_START_PATH_OR_STATE,
);

/**
 * Cached error for start() called when router is already started/starting.
 */
const CACHED_ALREADY_STARTED_ERROR = new RouterError(
  errorCodes.ROUTER_ALREADY_STARTED,
);

type StartRouterArguments =
  | []
  | [done: DoneFn]
  | [startPathOrState: string | State]
  | [startPathOrState: string | State, done: DoneFn];

const getStartRouterArguments = (
  args: StartRouterArguments,
): [startPathOrState: string | State | undefined, done: DoneFn] => {
  // Simple validation
  if (args.length > 2) {
    throw new Error("Invalid number of arguments");
  }

  const [first, second] = args;

  if (!first) {
    return [undefined, noop];
  }
  if (typeof first === "function") {
    return [undefined, first];
  }

  return [first, second ?? noop];
};

/**
 * State resolution logic.
 */
const resolveStartState = <Dependencies extends DefaultDependencies>(
  pathOrState: string | State,
  router: Router<Dependencies>,
): State | undefined => {
  if (typeof pathOrState === "string") {
    return router.matchPath(pathOrState);
  }

  // Validate state object structure using isState type guard
  // This validates: name (non-empty string), path (string), params (plain object)
  // Rejects: missing fields, wrong types, functions, symbols, class instances
  if (!isState(pathOrState)) {
    return undefined;
  }

  // Validate that the route exists
  // buildPath throws RouteNotFoundError for invalid routes, so we wrap in try-catch
  // to gracefully return undefined instead of propagating the error
  // See: https://github.com/greydragon888/real-router/issues/42
  try {
    router.buildPath(pathOrState.name, pathOrState.params);
  } catch {
    return undefined;
  }

  return pathOrState;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLIC DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════
// RouterLifecycle → Navigation.navigateToState() (for start transitions)
// RouterLifecycle → Navigation.isNavigating() (check before stop)
//
// Solution: functional references configured in Router.#setupDependencies()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Independent namespace for managing router lifecycle.
 *
 * Handles start(), stop(), isStarted(), and isActive().
 */
export class RouterLifecycleNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  // ═══════════════════════════════════════════════════════════════════════════
  // Functional references for cyclic dependencies
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Functional reference to NavigationNamespace.navigateToState().
   * Must be set before calling start().
   */

  navigateToState!: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    callback: DoneFn,
    emitSuccess: boolean,
  ) => CancelFn;

  #started = false;
  #active = false;

  // Router reference for lifecycle operations (set after construction)
  #router: Router<Dependencies> | undefined;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets the router reference for lifecycle operations.
   * Must be called before using lifecycle methods.
   */
  setRouter(router: Router<Dependencies>): void {
    this.#router = router;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  /**
   * Checks if the router has completed its initial start.
   */
  isStarted(): boolean {
    return this.#started;
  }

  /**
   * Checks if the router is starting or started (allows transitions).
   * Used by transition to check if transitions should be cancelled.
   */
  isActive(): boolean {
    return this.#active;
  }

  /**
   * Starts the router with an optional path or state.
   */
  start(...args: StartRouterArguments): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
    const router = this.#router!;
    const options = router.getOptions();
    const [startPathOrState, done] = getStartRouterArguments(args);

    let callbackInvoked = false;

    // Early return if already started or starting (concurrent start() protection)
    // Issue #50: Check both isStarted() and isActive() to block concurrent start() calls
    // - isStarted(): Router has completed initial start
    // - isActive(): Router is in the process of starting (async transition in progress)
    // Performance: Uses cached error to avoid object allocation (~500ns-2μs saved)
    if (this.#started || this.#active) {
      callbackInvoked = true;

      done(CACHED_ALREADY_STARTED_ERROR);

      return;
    }

    // ==========================================================================
    // Early return for NO_START_PATH_OR_STATE (Performance Optimization)
    // ==========================================================================
    // Check BEFORE setIsActive() to avoid:
    // - setIsActive/unsetIsActive calls
    // - handleTransitionComplete overhead
    // - Event emission setup
    //
    // This is a common error case: start() called without path and no defaultRoute.
    // Optimizing this path saves ~80% of error handling overhead.
    // ==========================================================================
    if (!startPathOrState && !options.defaultRoute) {
      callbackInvoked = true;

      // Lazy emit: only invoke if listeners exist
      // hasListeners check (~5ns) vs invokeEventListeners validation (~100ns+)
      if (router.hasListeners(events.TRANSITION_ERROR)) {
        router.invokeEventListeners(
          events.TRANSITION_ERROR,
          undefined,
          undefined,
          CACHED_NO_START_PATH_ERROR,
        );
      }

      done(CACHED_NO_START_PATH_ERROR);

      return;
    }

    // Issue #50: Mark router as active BEFORE attempting transition
    // This allows the transition to proceed (isCancelled() checks isActive())
    this.#active = true;

    const protectedDone = (err?: RouterError, state?: State) => {
      if (callbackInvoked) {
        logger.warn("real-router", "Callback already invoked");

        return;
      }

      callbackInvoked = true;
      // State is already frozen from makeState() in start flow
      done(err, state);
    };

    // Base options for all operations in start() method
    const startOptions: NavigationOptions = {
      replace: true, // start() always replace history
    };

    // Centralized callback for transition completion
    // See: https://github.com/greydragon888/real-router/issues/44
    // Transition errors are always reported (no silent fallback to defaultRoute)
    //
    // See: https://github.com/greydragon888/real-router/issues/50
    // Two-phase start: Only mark router as started AFTER successful transition
    // This prevents inconsistent state where isStarted()=true but getState()=undefined
    //
    // Note: emitErrorEvent controls whether TRANSITION_ERROR event is emitted:
    // - true: for errors NOT going through navigateToState (ROUTE_NOT_FOUND, NO_START_PATH_OR_STATE)
    // - false: for errors from performTransition (navigateToState already emits TRANSITION_ERROR)
    const handleTransitionComplete = (
      err?: RouterError,
      state?: State,
      emitErrorEvent = false,
    ) => {
      if (err) {
        // Issue #50: Unset active flag on failure (router is no longer starting)
        this.#active = false;

        if (emitErrorEvent && router.hasListeners(events.TRANSITION_ERROR)) {
          // Emit TRANSITION_ERROR for errors not going through navigateToState
          // Performance: Skip emission if no listeners
          router.invokeEventListeners(
            events.TRANSITION_ERROR,
            undefined,
            undefined,
            err,
          );
        }
      } else {
        // Two-phase start: Only set started and emit ROUTER_START on success
        // See: https://github.com/greydragon888/real-router/issues/50
        this.#started = true;
        router.invokeEventListeners(events.ROUTER_START);

        router.invokeEventListeners(
          events.TRANSITION_SUCCESS,
          state,
          undefined,
          { replace: true },
        );
      }
      // For performTransition errors, TRANSITION_ERROR is already emitted by navigateToState

      protectedDone(err, state);
    };

    // Perform the actual transition
    // See: https://github.com/greydragon888/real-router/issues/44
    // On error, always report to handleTransitionComplete (no silent fallback)
    const performTransition = (
      toState: State,
      navOptions: NavigationOptions = {},
    ) => {
      // Use functional reference to NavigationNamespace.navigateToState
      this.navigateToState(
        toState,
        undefined,
        navOptions,
        (err: RouterErrorType | undefined, resultState: State | undefined) => {
          handleTransitionComplete(err, resultState);
        },
        false, // emitSuccess = false - handleTransitionComplete will emit
      );
    };

    // Build state for default route and perform transition
    // Uses performTransition to properly handle two-phase start
    const navigateToDefault = (
      defaultRouteName: string,
      defaultParams: Params,
      navOptions: NavigationOptions,
    ) => {
      const defaultRoute = router.buildState(defaultRouteName, defaultParams);

      if (!defaultRoute) {
        handleTransitionComplete(
          new RouterError(errorCodes.ROUTE_NOT_FOUND, {
            routeName: defaultRouteName,
          }),
          undefined,
          true,
        );

        return;
      }

      const toState = router.makeState(
        defaultRoute.name,
        defaultRoute.params,
        router.buildPath(defaultRoute.name, defaultRoute.params),
        {
          params: defaultRoute.meta,
          options: navOptions,
          redirected: false,
        },
      );

      performTransition(toState, navOptions);
    };

    // Resolve start path/state: use defaultRoute if no explicit path provided
    // Note: Early return for "no path AND no defaultRoute" is handled above
    const resolvedStartPathOrState = startPathOrState ?? options.defaultRoute;

    // Parse the start path or state
    const startState = resolveStartState(resolvedStartPathOrState, router);

    // Determine the target state and path
    const targetPath =
      typeof resolvedStartPathOrState === "string"
        ? resolvedStartPathOrState
        : "";

    // Perform transition based on conditions
    // All start() transitions should use replace: true
    // See: https://github.com/greydragon888/real-router/issues/43
    if (startState) {
      performTransition(startState, startOptions);
    } else if (options.defaultRoute && !startPathOrState) {
      // IMPORTANT: Check !startPathOrState (original argument), NOT !resolvedStartPathOrState
      // This distinguishes between:
      //   - User called start() without path → use defaultRoute (this branch)
      //   - User called start('/invalid') with explicit path → error, no silent fallback
      // See: https://github.com/greydragon888/real-router/issues/44

      const params = options.defaultParams;

      navigateToDefault(options.defaultRoute, params, startOptions);
    } else if (options.allowNotFound) {
      performTransition(
        router.makeNotFoundState(targetPath, startOptions),
        startOptions,
      );
    } else {
      handleTransitionComplete(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: targetPath }),
        undefined,
        true, // emitErrorEvent: doesn't go through navigateToState
      );
    }
  }

  /**
   * Stops the router and resets state.
   */
  stop(): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always set by Router
    const router = this.#router!;

    // Issue #50: Always unset active flag when stopping
    // This cancels any in-flight transitions via isCancelled() check
    this.#active = false;

    if (this.#started) {
      this.#started = false;

      router.setState(undefined);

      router.invokeEventListeners(events.ROUTER_STOP);
    }
  }
}
