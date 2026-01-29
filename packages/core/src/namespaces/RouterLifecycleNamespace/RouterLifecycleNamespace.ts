// packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts

import { logger } from "@real-router/logger";

import {
  CACHED_ALREADY_STARTED_ERROR,
  CACHED_NO_START_PATH_ERROR,
} from "./constants";
import { getStartRouterArguments, resolveStartState } from "./helpers";
import { errorCodes, events } from "../../constants";
import { RouterError } from "../../RouterError";

import type {
  RouterLifecycleDependencies,
  StartRouterArguments,
} from "./types";
import type {
  CancelFn,
  DoneFn,
  NavigationOptions,
  Params,
  RouterError as RouterErrorType,
  State,
} from "@real-router/types";

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
export class RouterLifecycleNamespace {
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

  // Dependencies injected via setDependencies (replaces full router reference)
  #deps: RouterLifecycleDependencies | undefined;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates start() arguments.
   */
  static validateStartArgs(args: unknown[]): void {
    if (args.length > 2) {
      throw new Error(
        "[router.start] Invalid number of arguments. Expected 0-2 arguments.",
      );
    }
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies for lifecycle operations.
   * Must be called before using lifecycle methods.
   */
  setDependencies(deps: RouterLifecycleDependencies): void {
    this.#deps = deps;
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
    const deps = this.#deps!;
    const options = deps.getOptions();
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
      if (deps.hasListeners(events.TRANSITION_ERROR)) {
        deps.invokeEventListeners(
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
      /* v8 ignore next 5 -- @preserve defensive: protects against user callback bugs */
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

        if (emitErrorEvent && deps.hasListeners(events.TRANSITION_ERROR)) {
          // Emit TRANSITION_ERROR for errors not going through navigateToState
          // Performance: Skip emission if no listeners
          deps.invokeEventListeners(
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
        deps.invokeEventListeners(events.ROUTER_START);

        deps.invokeEventListeners(events.TRANSITION_SUCCESS, state, undefined, {
          replace: true,
        });
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
      const defaultRoute = deps.buildState(defaultRouteName, defaultParams);

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

      const toState = deps.makeState(
        defaultRoute.name,
        defaultRoute.params,
        deps.buildPath(defaultRoute.name, defaultRoute.params),
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
    const startState = resolveStartState(resolvedStartPathOrState, deps);

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
        deps.makeNotFoundState(targetPath, startOptions),
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
    const deps = this.#deps!;

    // Issue #50: Always unset active flag when stopping
    // This cancels any in-flight transitions via isCancelled() check
    this.#active = false;

    if (this.#started) {
      this.#started = false;

      deps.setState();

      deps.invokeEventListeners(events.ROUTER_STOP);
    }
  }
}
