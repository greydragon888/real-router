// packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts

import { logger } from "@real-router/logger";

import { transition } from "./transition";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigateToStateArgs,
  validateNavigationOptions,
} from "./validators";
import { events, errorCodes, constants } from "../../constants";
import { RouterError } from "../../RouterError";
import { resolveOption } from "../OptionsNamespace";

import type { NavigationDependencies, TransitionDependencies } from "./types";
import type { NavigationOptions, Params, State } from "@real-router/types";

/**
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToState(), and transition state.
 */
export class NavigationNamespace {
  // ═══════════════════════════════════════════════════════════════════════════
  // Functional reference for cyclic dependency
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Functional reference to RouterLifecycleNamespace.isStarted().
   * Must be set before calling navigate().
   */

  isRouterStarted!: () => boolean;

  #navigating = false;

  // Dependencies injected via setDependencies (replaces full router reference)
  #depsStore: NavigationDependencies | undefined;
  #transitionDepsStore: TransitionDependencies | undefined;

  /**
   * Gets dependencies or throws if not initialized.
   */
  get #deps(): NavigationDependencies {
    /* v8 ignore next 3 -- @preserve: deps always set by Router.ts */
    if (!this.#depsStore) {
      throw new Error(
        "[real-router] NavigationNamespace: dependencies not initialized",
      );
    }

    return this.#depsStore;
  }

  /**
   * Gets transition dependencies or throws if not initialized.
   */
  get #transitionDeps(): TransitionDependencies {
    /* v8 ignore next 3 -- @preserve: transitionDeps always set by Router.ts */
    if (!this.#transitionDepsStore) {
      throw new Error(
        "[real-router] NavigationNamespace: transition dependencies not initialized",
      );
    }

    return this.#transitionDepsStore;
  }

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateNavigateArgs(name: unknown): asserts name is string {
    validateNavigateArgs(name);
  }

  static validateNavigateToStateArgs(
    toState: unknown,
    fromState: unknown,
    opts: unknown,
    emitSuccess: unknown,
  ): void {
    validateNavigateToStateArgs(toState, fromState, opts, emitSuccess);
  }

  static validateNavigateToDefaultArgs(opts: unknown): void {
    validateNavigateToDefaultArgs(opts);
  }

  static validateNavigationOptions(
    opts: unknown,
    methodName: string,
  ): asserts opts is NavigationOptions {
    validateNavigationOptions(opts, methodName);
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies for navigation operations.
   * Must be called before using navigation methods.
   */
  setDependencies(deps: NavigationDependencies): void {
    this.#depsStore = deps;
  }

  /**
   * Sets dependencies for transition operations.
   * Must be called before using navigation methods.
   */
  setTransitionDependencies(deps: TransitionDependencies): void {
    this.#transitionDepsStore = deps;
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
    this.#navigating = false;
  }

  /**
   * Internal navigation function that accepts pre-built state.
   * Used by RouterLifecycleNamespace for start() transitions.
   */
  async navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    emitSuccess: boolean,
  ): Promise<State> {
    const deps = this.#deps;
    const transitionDeps = this.#transitionDeps;

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
    deps.invokeEventListeners(events.TRANSITION_START, toState, fromState);

    try {
      const finalState = await transition(
        transitionDeps,
        toState,
        fromState,
        opts,
      );

      // Route was already validated in navigate() via buildState().
      // Since guards can no longer redirect (Issue #55), the state.name cannot change.
      // However, routes can be dynamically removed during async navigation,
      // so we do a lightweight check with hasRoute() instead of full buildState().
      // UNKNOWN_ROUTE is always valid (used for 404 handling).
      if (
        finalState.name === constants.UNKNOWN_ROUTE ||
        deps.hasRoute(finalState.name)
      ) {
        deps.setState(finalState);

        // Emit TRANSITION_SUCCESS only if requested
        if (emitSuccess) {
          deps.invokeEventListeners(
            events.TRANSITION_SUCCESS,
            finalState,
            fromState,
            opts,
          );
        }

        // State is already frozen from transition module
        return finalState;
      } else {
        // Route was removed during async navigation
        throw new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: finalState.name,
        });
      }
    } catch (err) {
      // Error handling
      if (err instanceof RouterError) {
        if (err.code === errorCodes.TRANSITION_CANCELLED) {
          deps.invokeEventListeners(
            events.TRANSITION_CANCEL,
            toState,
            fromState,
          );
        } else if (err.code === errorCodes.ROUTE_NOT_FOUND) {
          // ROUTE_NOT_FOUND after successful transition (route removed)
          deps.invokeEventListeners(
            events.TRANSITION_ERROR,
            undefined,
            deps.getState(),
            err,
          );
        } else {
          deps.invokeEventListeners(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            err,
          );
        }
      } else {
        deps.invokeEventListeners(
          events.TRANSITION_ERROR,
          toState,
          fromState,
          err as RouterError,
        );
      }

      throw err;
    } finally {
      this.#navigating = false;
    }
  }

  /**
   * Navigates to a route by name.
   * Arguments should be pre-parsed and validated by facade.
   */
  navigate(
    name: string,
    params: Params,
    opts: NavigationOptions,
  ): Promise<State> {
    const deps = this.#deps;

    // Quick check of the state of the router
    if (!this.isRouterStarted()) {
      const err = new RouterError(errorCodes.ROUTER_NOT_STARTED);
      return Promise.reject(err);
    }

    // build route state with segments (avoids duplicate getSegmentsByName call)
    const result = deps.buildStateWithSegments(name, params);

    if (!result) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND);

      deps.invokeEventListeners(
        events.TRANSITION_ERROR,
        undefined,
        deps.getState(),
        err,
      );

      return Promise.reject(err);
    }

    const { state: route } = result;

    // create a target state
    const toState = deps.makeState(
      route.name,
      route.params,
      deps.buildPath(route.name, route.params),
      {
        params: route.meta,
        options: opts,
        redirected: opts.redirected ?? false,
      },
    );

    const fromState = deps.getState();

    // Fast verification for the same states
    if (
      !opts.reload &&
      !opts.force &&
      deps.areStatesEqual(fromState, toState, false)
    ) {
      const err = new RouterError(errorCodes.SAME_STATES);

      deps.invokeEventListeners(
        events.TRANSITION_ERROR,
        toState,
        fromState,
        err,
      );

      return Promise.reject(err);
    }

    // transition execution with TRANSITION_SUCCESS emission
    // Note: Guards cannot redirect - redirects are handled in middleware only
    const promise = this.navigateToState(toState, fromState, opts, true); // emitSuccess = true for public navigate()

    // Unhandled rejection mitigation: suppress expected errors
    promise.catch((err: RouterError) => {
      if (
        err.code === errorCodes.SAME_STATES ||
        err.code === errorCodes.TRANSITION_CANCELLED
      ) {
        // Expected errors - suppress unhandled rejection warnings
      } else {
        // Unexpected errors - log for debugging
        logger.error("router.navigate", "Unexpected navigation error", err);
      }
    });

    return promise;
  }

  /**
   * Navigates to the default route if configured.
   * Arguments should be pre-parsed and validated by facade.
   */
  navigateToDefault(opts: NavigationOptions): Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    if (!options.defaultRoute) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute not configured",
        }),
      );
    }

    const resolvedRoute = resolveOption(
      options.defaultRoute,
      deps.getDependency,
    ) as string;

    if (!resolvedRoute) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute resolved to empty",
        }),
      );
    }

    const resolvedParams = resolveOption(
      options.defaultParams,
      deps.getDependency,
    ) as Params;

    return this.navigate(resolvedRoute, resolvedParams, opts);
  }
}
