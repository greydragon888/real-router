// packages/real-router/modules/core/routerLifecycle.ts

import { logger } from "logger";
import { isState } from "type-guards";

import { errorCodes, events, RouterError } from "@real-router/core";

import { initBuildOptionsCache } from "./routes/routePath";

import type {
  DoneFn,
  NavigationOptions,
  Params,
  State,
  DefaultDependencies,
  Router,
  RouterError as RouterErrorType,
} from "core-types";

const noop = () => {};

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
 *
 * @internal
 */
const CACHED_NO_START_PATH_ERROR = new RouterError(
  errorCodes.NO_START_PATH_OR_STATE,
);

/**
 * Cached error for start() called when router is already started/starting.
 *
 * @internal
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

// State resolution logic
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

// Note: Guards cannot redirect - redirects are not supported from guards
// See: https://github.com/greydragon888/real-router/issues/44
// Transition errors are always reported to callback, no silent fallback to defaultRoute

const STARTED = Symbol("started");
// Issue #50: Track "active" state separately from "started"
// Active = router is starting or started (allows transitions)
// Started = router has completed initial start (allows navigation)
const ACTIVE = Symbol("active");

export function withRouterLifecycle<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  router[STARTED] = false;
  router[ACTIVE] = false;

  const setIsStarted = () => {
    router[STARTED] = true;
  };

  const unsetIsStarted = () => {
    router[STARTED] = false;
  };

  const setIsActive = () => {
    router[ACTIVE] = true;
  };

  const unsetIsActive = () => {
    router[ACTIVE] = false;
  };

  router.isStarted = () => !!router[STARTED];

  // Issue #50: isActive() indicates router is starting or started
  // Used by transition to check if transitions should be cancelled
  router.isActive = () => !!router[ACTIVE];

  router.start = (...args: StartRouterArguments): Router<Dependencies> => {
    const options = router.getOptions();
    const [startPathOrState, done] = getStartRouterArguments(args);

    let callbackInvoked = false;

    // Early return if already started or starting (concurrent start() protection)
    // Issue #50: Check both isStarted() and isActive() to block concurrent start() calls
    // - isStarted(): Router has completed initial start
    // - isActive(): Router is in the process of starting (async transition in progress)
    // Performance: Uses cached error to avoid object allocation (~500ns-2μs saved)
    if (router.isStarted() || router.isActive()) {
      callbackInvoked = true;

      done(CACHED_ALREADY_STARTED_ERROR);

      return router;
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

      return router;
    }

    // Issue #50: Mark router as active BEFORE attempting transition
    // This allows the transition to proceed (isCancelled() checks isActive())
    setIsActive();

    // Perform the actual transition
    // See: https://github.com/greydragon888/real-router/issues/44
    // On error, always report to handleTransitionComplete (no silent fallback)
    const performTransition = (
      toState: State,
      navOptions: NavigationOptions = {},
    ) => {
      // Use internal navigateToState without emitting TRANSITION_SUCCESS
      // handleTransitionComplete will emit it
      router.navigateToState(
        toState,
        undefined,
        navOptions,
        (err: RouterErrorType | undefined, resultState: State | undefined) => {
          handleTransitionComplete(err, resultState);
        },
        false, // emitSuccess = false - handleTransitionComplete will emit
      );
    };

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
        unsetIsActive();

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
        setIsStarted();
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

    // Check if we can attempt to start the router
    // See: https://github.com/greydragon888/real-router/issues/50
    // Two-phase start: We only initialize the cache here, but don't mark as started yet.
    // The router will be marked as started only after successful transition in handleTransitionComplete.
    //
    // Note: !startPathOrState checks ORIGINAL argument to distinguish:
    //   - start() without path → can use defaultRoute
    //   - start('/invalid') with explicit path → no silent fallback (Issue #44)
    const canAttemptStart =
      startState !== undefined ||
      options.allowNotFound ||
      (options.defaultRoute && !startPathOrState);

    if (canAttemptStart) {
      // Setup buildOptions cache for buildPath (needed for transition)
      initBuildOptionsCache(router, options);
    }

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

    return router;
  };

  router.stop = (): Router<Dependencies> => {
    // Issue #50: Always unset active flag when stopping
    // This cancels any in-flight transitions via isCancelled() check
    unsetIsActive();

    if (router.isStarted()) {
      unsetIsStarted();

      router.setState(undefined);

      router.invokeEventListeners(events.ROUTER_STOP);
    }

    return router;
  };

  return router;
}
