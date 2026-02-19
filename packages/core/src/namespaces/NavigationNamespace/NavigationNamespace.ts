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

import type {
  NavigationDependencies,
  TransitionDependencies,
  TransitionOutput,
} from "./types";
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
   * Functional reference to check if navigation is possible.
   * Must be set before calling navigate().
   */
  canNavigate!: () => boolean;

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

  /**
   * Navigates to a route by name.
   * Arguments should be pre-parsed and validated by facade.
   */
  async navigate(
    name: string,
    params: Params,
    opts: NavigationOptions,
  ): Promise<State> {
    if (!this.canNavigate()) {
      throw new RouterError(errorCodes.ROUTER_NOT_STARTED);
    }

    const deps = this.#deps;

    const result = deps.buildStateWithSegments(name, params);

    if (!result) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND);

      deps.emitTransitionError(undefined, deps.getState(), err);

      throw err;
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

      throw err;
    }

    return this.navigateToState(toState, fromState, opts);
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

    if (transitionDeps.isTransitioning()) {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use router.clone() to create isolated instance per request.",
      );
      deps.cancelNavigation();
    }

    deps.startTransition(toState, fromState);

    try {
      const { state: finalState, meta: transitionOutput } = await transition(
        transitionDeps,
        toState,
        fromState,
        opts,
      );

      if (
        finalState.name === constants.UNKNOWN_ROUTE ||
        deps.hasRoute(finalState.name)
      ) {
        const stateWithTransition = NavigationNamespace.#buildSuccessState(
          finalState,
          transitionOutput,
          fromState,
        );

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
      this.#routeTransitionError(error, toState, fromState);

      throw error;
    }
  }

  /**
   * Navigates to the default route if configured.
   * Arguments should be pre-parsed and validated by facade.
   */
  async navigateToDefault(opts: NavigationOptions): Promise<State> {
    const deps = this.#deps;
    const options = deps.getOptions();

    if (!options.defaultRoute) {
      throw new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: "defaultRoute not configured",
      });
    }

    const resolvedRoute = resolveOption(
      options.defaultRoute,
      deps.getDependency,
    );

    if (!resolvedRoute) {
      throw new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: "defaultRoute resolved to empty",
      });
    }

    const resolvedParams = resolveOption(
      options.defaultParams,
      deps.getDependency,
    );

    return this.navigate(resolvedRoute, resolvedParams, opts);
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Builds the final state with frozen TransitionMeta attached.
   */
  static #buildSuccessState(
    finalState: State,
    transitionOutput: TransitionOutput["meta"],
    fromState: State | undefined,
  ): State {
    const transitionMeta: TransitionMeta = {
      phase: transitionOutput.phase,
      ...(fromState?.name !== undefined && { from: fromState.name }),
      reason: "success",
      segments: transitionOutput.segments,
    };

    Object.freeze(transitionMeta.segments.deactivated);
    Object.freeze(transitionMeta.segments.activated);
    Object.freeze(transitionMeta.segments);
    Object.freeze(transitionMeta);

    return {
      ...finalState,
      transition: transitionMeta,
    };
  }

  /**
   * Routes a caught transition error to the correct FSM event.
   */
  #routeTransitionError(
    error: unknown,
    toState: State,
    fromState: State | undefined,
  ): void {
    /* v8 ignore next 3 -- @preserve: transition pipeline always wraps errors into RouterError */
    if (!(error instanceof RouterError)) {
      this.#deps.sendTransitionError(toState, fromState, error as RouterError);

      return;
    }

    // Already routed: cancel/stop sent CANCEL, sendTransitionError called in try block
    if (
      error.code === errorCodes.TRANSITION_CANCELLED ||
      error.code === errorCodes.ROUTE_NOT_FOUND
    ) {
      return;
    }

    if (
      error.code === errorCodes.CANNOT_ACTIVATE ||
      error.code === errorCodes.CANNOT_DEACTIVATE
    ) {
      this.#deps.sendTransitionBlocked(toState, fromState, error);
    } else {
      this.#deps.sendTransitionError(toState, fromState, error);
    }
  }
}
