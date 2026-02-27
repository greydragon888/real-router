// packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts

import { logger } from "@real-router/logger";

import { transition } from "./transition";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
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

  // Dependencies injected via setDependencies (replaces full router reference)
  #canNavigate!: () => boolean;
  #deps!: NavigationDependencies;
  #transitionDeps!: TransitionDependencies;
  #currentController: AbortController | null = null;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // Proxy to functions in validators.ts for separation of concerns
  // =========================================================================

  static validateNavigateArgs(name: unknown): asserts name is string {
    validateNavigateArgs(name);
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
   * Sets the canNavigate check (cyclic dependency on EventBusNamespace).
   * Must be called before using navigate().
   */
  setCanNavigate(fn: () => boolean): void {
    this.#canNavigate = fn;
  }

  /**
   * Sets dependencies for navigation operations.
   * Must be called before using navigation methods.
   */
  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
  }

  /**
   * Sets dependencies for transition operations.
   * Must be called before using navigation methods.
   */
  setTransitionDependencies(deps: TransitionDependencies): void {
    this.#transitionDeps = deps;
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
    if (!this.#canNavigate()) {
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

    // eslint-disable-next-line sonarjs/no-unused-vars
    const { signal: _signal, ...cleanOpts } = opts;
    const toState = deps.makeState(
      route.name,
      route.params,
      deps.buildPath(route.name, route.params),
      {
        params: route.meta,
        options: cleanOpts,
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
          "For SSR, use cloneRouter() to create isolated instance per request.",
      );
      deps.cancelNavigation();
    }

    const controller = new AbortController();

    this.#currentController = controller;

    /* v8 ignore next 8 -- @preserve: external signal integration tested by AbortController API tests (Task 6); branch not reachable without caller providing opts.signal */
    if (opts.signal) {
      if (opts.signal.aborted) {
        this.#currentController = null;

        throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
          reason: opts.signal.reason,
        });
      }

      opts.signal.addEventListener(
        "abort",
        () => {
          controller.abort(opts.signal?.reason);
        },
        { once: true, signal: controller.signal },
      );
    }

    deps.startTransition(toState, fromState);

    try {
      const { state: finalState, meta: transitionOutput } = await transition(
        transitionDeps,
        toState,
        fromState,
        opts,
        controller.signal,
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

        // eslint-disable-next-line sonarjs/no-unused-vars
        const { signal: _signal2, ...transitionOpts } = opts;

        deps.sendTransitionDone(stateWithTransition, fromState, transitionOpts);

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
    } finally {
      controller.abort(); // Cleanup: removes listener on external signal
      if (this.#currentController === controller) {
        this.#currentController = null;
      }
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

  /**
   * Aborts the current in-flight navigation, if any.
   */
  /* v8 ignore next 4 -- @preserve: new public method tested by AbortController API integration tests (Task 6) */
  abortCurrentNavigation(): void {
    this.#currentController?.abort(
      new RouterError(errorCodes.TRANSITION_CANCELLED),
    );
    this.#currentController = null;
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
    const routerError = error as RouterError;

    // Already routed: cancel/stop sent CANCEL, sendTransitionError called in try block
    if (
      routerError.code === errorCodes.TRANSITION_CANCELLED ||
      routerError.code === errorCodes.ROUTE_NOT_FOUND
    ) {
      return;
    }

    /* v8 ignore next 7 -- @preserve: defensive guard for unexpected error codes (e.g. future error types); else branch unreachable after middleware became fire-and-forget */
    if (
      routerError.code === errorCodes.CANNOT_ACTIVATE ||
      routerError.code === errorCodes.CANNOT_DEACTIVATE
    ) {
      this.#deps.sendTransitionBlocked(toState, fromState, routerError);
    } else {
      this.#deps.sendTransitionError(toState, fromState, routerError);
    }
  }
}
