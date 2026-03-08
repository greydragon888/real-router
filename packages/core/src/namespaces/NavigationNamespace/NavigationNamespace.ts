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
import { nameToIDs } from "../../transitionPath";

import type { NavigationDependencies, TransitionOutput } from "./types";
import type {
  NavigationOptions,
  Params,
  State,
  TransitionMeta,
} from "@real-router/types";

const FROZEN_ACTIVATED: string[] = [constants.UNKNOWN_ROUTE];

Object.freeze(FROZEN_ACTIVATED);
const FROZEN_REPLACE_OPTS: NavigationOptions = { replace: true };

Object.freeze(FROZEN_REPLACE_OPTS);

function forceReplaceFromUnknown(
  opts: NavigationOptions,
  fromState: State | undefined,
): NavigationOptions {
  return fromState?.name === constants.UNKNOWN_ROUTE && !opts.replace
    ? { ...opts, replace: true }
    : opts;
}

function stripSignal({
  signal: _,
  ...rest
}: NavigationOptions): NavigationOptions {
  return rest;
}

function routeTransitionError(
  deps: NavigationDependencies,
  error: unknown,
  toState: State,
  fromState: State | undefined,
): void {
  const routerError = error as RouterError;

  if (
    routerError.code === errorCodes.TRANSITION_CANCELLED ||
    routerError.code === errorCodes.ROUTE_NOT_FOUND
  ) {
    return;
  }

  deps.sendTransitionFail(toState, fromState, routerError);
}

function buildSuccessState(
  finalState: State,
  transitionOutput: TransitionOutput["meta"],
  fromState: State | undefined,
  opts: NavigationOptions,
): State {
  const transitionMeta: TransitionMeta = {
    phase: transitionOutput.phase,
    ...(fromState?.name !== undefined && { from: fromState.name }),
    reason: "success",
    segments: transitionOutput.segments,
    ...(opts.reload !== undefined && { reload: opts.reload }),
    ...(opts.redirected !== undefined && { redirected: opts.redirected }),
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
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToNotFound(), and transition state.
 */
export class NavigationNamespace {
  #deps!: NavigationDependencies;
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

  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
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
    if (!this.#deps.canNavigate()) {
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
      },
    );

    const fromState = deps.getState();

    opts = forceReplaceFromUnknown(opts, fromState);

    if (
      fromState &&
      !opts.reload &&
      !opts.force &&
      deps.areStatesEqual(fromState, toState, false)
    ) {
      const err = new RouterError(errorCodes.SAME_STATES);

      deps.emitTransitionError(toState, fromState, err);

      throw err;
    }

    if (deps.isTransitioning()) {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use cloneRouter() to create isolated instance per request.",
      );
      this.#currentController?.abort(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      deps.cancelNavigation();
    }

    const controller = new AbortController();

    this.#currentController = controller;

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
        deps,
        toState,
        fromState,
        opts,
        controller.signal,
      );

      if (
        finalState.name === constants.UNKNOWN_ROUTE ||
        deps.hasRoute(finalState.name)
      ) {
        const stateWithTransition = buildSuccessState(
          finalState,
          transitionOutput,
          fromState,
          opts,
        );

        deps.setState(stateWithTransition);

        const transitionOpts =
          opts.signal === undefined ? opts : stripSignal(opts);

        deps.sendTransitionDone(stateWithTransition, fromState, transitionOpts);

        return stateWithTransition;
      } else {
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: finalState.name,
        });

        deps.sendTransitionFail(finalState, fromState, err);

        throw err;
      }
    } catch (error) {
      routeTransitionError(deps, error, toState, fromState);

      throw error;
    } finally {
      controller.abort();
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

    const resolvedRoute = deps.resolveDefaultRoute();

    if (!resolvedRoute) {
      throw new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: "defaultRoute resolved to empty",
      });
    }

    const resolvedParams = deps.resolveDefaultParams();

    return this.navigate(resolvedRoute, resolvedParams, opts);
  }

  navigateToNotFound(path: string): State {
    if (this.#deps.isTransitioning()) {
      this.#currentController?.abort(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      this.#deps.cancelNavigation();
    }

    const fromState = this.#deps.getState();
    const deactivated: string[] = fromState
      ? nameToIDs(fromState.name).toReversed()
      : [];

    Object.freeze(deactivated);

    const segments: TransitionMeta["segments"] = {
      deactivated,
      activated: FROZEN_ACTIVATED,
      intersection: "",
    };

    Object.freeze(segments);

    const transitionMeta: TransitionMeta = {
      phase: "activating",
      ...(fromState && { from: fromState.name }),
      reason: "success",
      segments,
    };

    Object.freeze(transitionMeta);

    const state: State = {
      name: constants.UNKNOWN_ROUTE,
      params: {} as Params,
      path,
      transition: transitionMeta,
    };

    Object.freeze(state);

    this.#deps.setState(state);
    this.#deps.emitTransitionSuccess(state, fromState, FROZEN_REPLACE_OPTS);

    return state;
  }

  abortCurrentNavigation(): void {
    this.#currentController?.abort(
      new RouterError(errorCodes.TRANSITION_CANCELLED),
    );
    this.#currentController = null;
  }
}
