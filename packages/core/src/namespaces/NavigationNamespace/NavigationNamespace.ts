// packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts

import { logger } from "@real-router/logger";

import { transition } from "./transition";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigateToStateArgs,
  validateNavigationOptions,
} from "./validators";
import { errorCodes, constants } from "../../constants";
import { RouterError } from "../../RouterError";
import { resolveOption } from "../OptionsNamespace";

import type { NavigationDependencies, TransitionDependencies } from "./types";
import type {
  NavigationOptions,
  Params,
  State,
  TransitionMeta,
} from "@real-router/types";

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
  ): void {
    validateNavigateToStateArgs(toState, fromState, opts);
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

  /* v8 ignore next 6 -- @preserve: isNavigating() reserved for future use; Router.ts uses its own isNavigating() */
  isNavigating(): boolean {
    return (
      this.isRouterStarted() &&
      this.#transitionDeps.getTransitionState() === "RUNNING"
    );
  }

  /**
   * Internal navigation function that accepts pre-built state.
   * Used by RouterLifecycleNamespace for start() transitions.
   */
  async navigateToState(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ): Promise<State> {
    const deps = this.#deps;
    const transitionDeps = this.#transitionDeps;

    if (transitionDeps.getTransitionState() !== "IDLE") {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use router.clone() to create isolated instance per request.",
      );
    }

    deps.cancelNavigation();
    deps.startTransition(toState, fromState);

    try {
      const transitionStart = performance.now();

      const { state: finalState, meta: transitionOutput } = await transition(
        transitionDeps,
        toState,
        fromState,
        opts,
      );

      const duration = performance.now() - transitionStart;

      if (
        finalState.name === constants.UNKNOWN_ROUTE ||
        deps.hasRoute(finalState.name)
      ) {
        const transitionMeta: TransitionMeta = {
          phase: transitionOutput.phase,
          duration,
          ...(fromState?.name !== undefined && { from: fromState.name }),
          reason: "success",
          segments: transitionOutput.segments,
        };

        Object.freeze(transitionMeta.segments.deactivated);
        Object.freeze(transitionMeta.segments.activated);
        Object.freeze(transitionMeta.segments);
        Object.freeze(transitionMeta);

        const stateWithTransition: State = {
          ...finalState,
          transition: transitionMeta,
        };

        deps.setState(stateWithTransition);
        deps.sendTransitionDone(stateWithTransition, fromState, opts);

        return stateWithTransition;
      } else {
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: finalState.name,
        });

        deps.sendTransitionError(finalState, fromState, err);

        throw err;
      }
    } catch (error) {
      /* v8 ignore next -- @preserve: transition pipeline always wraps errors into RouterError */
      if (error instanceof RouterError) {
        switch (error.code) {
          case errorCodes.TRANSITION_CANCELLED: {
            // cancel/stop already sent CANCEL to TransitionFSM

            break;
          }
          case errorCodes.ROUTE_NOT_FOUND: {
            // sendTransitionError already called in try block above
            break;
          }
          case errorCodes.CANNOT_ACTIVATE:
          case errorCodes.CANNOT_DEACTIVATE: {
            deps.sendTransitionBlocked(toState, fromState, error);

            break;
          }
          default: {
            deps.sendTransitionError(toState, fromState, error);
          }
        }
      } else {
        /* v8 ignore next 2 -- @preserve: transition pipeline always wraps errors into RouterError */
        deps.sendTransitionError(toState, fromState, error as RouterError);
      }

      throw error;
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

    if (!this.isRouterStarted()) {
      const err = new RouterError(errorCodes.ROUTER_NOT_STARTED);

      return Promise.reject(err);
    }

    let result;

    try {
      result = deps.buildStateWithSegments(name, params);
    } catch (error) {
      return Promise.reject(error as Error);
    }

    if (!result) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND);

      deps.emitTransitionError(undefined, deps.getState(), err);

      return Promise.reject(err);
    }

    const { state: route } = result;

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

    if (
      !opts.reload &&
      !opts.force &&
      deps.areStatesEqual(fromState, toState, false)
    ) {
      const err = new RouterError(errorCodes.SAME_STATES);

      deps.emitTransitionError(toState, fromState, err);

      const rejection = Promise.reject(err);

      rejection.catch(() => {});

      return rejection;
    }

    const promise = this.navigateToState(toState, fromState, opts);

    promise.catch((error: unknown) => {
      if (
        error instanceof RouterError &&
        (error.code === errorCodes.SAME_STATES ||
          error.code === errorCodes.TRANSITION_CANCELLED)
      ) {
        // Expected errors - suppress unhandled rejection warnings
      } else {
        logger.error("router.navigate", "Unexpected navigation error", error);
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
    );

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
    );

    return this.navigate(resolvedRoute, resolvedParams, opts);
  }
}
