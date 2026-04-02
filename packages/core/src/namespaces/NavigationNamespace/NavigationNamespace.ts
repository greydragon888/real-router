import { logger } from "@real-router/logger";

import {
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_ERROR,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
} from "./constants";
import { completeTransition } from "./transition/completeTransition";
import { routeTransitionError } from "./transition/errorHandling";
import { executeGuardPipeline } from "./transition/guardPhase";
import { errorCodes, constants } from "../../constants";
import { RouterError } from "../../RouterError";
import { getTransitionPath, nameToIDs } from "../../transitionPath";

import type { NavigationContext, NavigationDependencies } from "./types";
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

function isSameNavigation(
  fromState: State | undefined,
  opts: NavigationOptions,
  toState: State,
): boolean {
  return (
    !!fromState &&
    !opts.reload &&
    !opts.force &&
    fromState.path === toState.path
  );
}

/**
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToNotFound(), and transition state.
 *
 * Performance: navigate() uses optimistic sync execution — guards run synchronously
 * until one returns a Promise, then switches to async. This eliminates Promise/AbortController
 * overhead for the common case (no guards or sync guards).
 */
export class NavigationNamespace {
  lastSyncResolved = false;
  lastSyncRejected = false;
  #deps!: NavigationDependencies;
  #currentController: AbortController | null = null;
  #navigationId = 0;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  navigate(
    name: string,
    params: Params,
    opts: NavigationOptions,
  ): Promise<State> {
    this.lastSyncResolved = false;
    const deps = this.#deps;

    // Fast-path sync rejections: cached error + cached Promise.reject
    // No allocations, no throw/catch overhead, facade skips .catch() suppression
    if (!deps.canNavigate()) {
      this.lastSyncRejected = true;

      return CACHED_NOT_STARTED_REJECTION;
    }

    let toState: State | undefined;
    let fromState: State | undefined;
    let transitionStarted = false;
    let controller: AbortController | null = null;

    try {
      toState = deps.buildNavigateState(name, params);

      if (!toState) {
        deps.emitTransitionError(
          undefined,
          deps.getState(),
          CACHED_ROUTE_NOT_FOUND_ERROR,
        );
        this.lastSyncRejected = true;

        return CACHED_ROUTE_NOT_FOUND_REJECTION;
      }

      fromState = deps.getState();
      opts = forceReplaceFromUnknown(opts, fromState);

      if (isSameNavigation(fromState, opts, toState)) {
        deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);
        this.lastSyncRejected = true;

        return CACHED_SAME_STATES_REJECTION;
      }

      this.#abortPreviousNavigation();

      if (opts.signal?.aborted) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
          reason: opts.signal.reason,
        });
      }

      const myId = ++this.#navigationId;

      deps.startTransition(toState, fromState);
      transitionStarted = true;

      // Reentrant navigate from TRANSITION_START listener superseded this navigation
      if (this.#navigationId !== myId) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      const [canDeactivateFunctions, canActivateFunctions] =
        deps.getLifecycleFunctions();
      const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

      const { toDeactivate, toActivate, intersection } = getTransitionPath(
        toState,
        fromState,
      );

      const shouldDeactivate =
        fromState && !opts.forceDeactivate && toDeactivate.length > 0;
      const shouldActivate = !isUnknownRoute && toActivate.length > 0;
      const hasGuards =
        canDeactivateFunctions.size > 0 || canActivateFunctions.size > 0;

      if (hasGuards) {
        controller = new AbortController();
        this.#currentController = controller;

        const signal = controller.signal;
        const isCurrentNav = () =>
          this.#navigationId === myId && deps.isActive();

        const guardCompletion = executeGuardPipeline(
          canDeactivateFunctions,
          canActivateFunctions,
          toDeactivate,
          toActivate,
          !!shouldDeactivate,
          shouldActivate,
          toState,
          fromState,
          signal,
          isCurrentNav,
          () => {},
        );

        if (guardCompletion !== undefined) {
          return this.#finishAsyncNavigation(
            guardCompletion,
            {
              toState,
              fromState,
              opts,
              toDeactivate,
              toActivate,
              intersection,
              canDeactivateFunctions,
            },
            controller,
            myId,
          );
        }

        if (!isCurrentNav()) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        this.#cleanupController(controller);
      }

      this.lastSyncResolved = true;

      return Promise.resolve(
        completeTransition(deps, {
          toState,
          fromState,
          opts,
          toDeactivate,
          toActivate,
          intersection,
          canDeactivateFunctions,
        }),
      );
    } catch (error) {
      this.#handleNavigateError(
        error,
        controller,
        transitionStarted,
        toState,
        fromState,
      );

      return Promise.reject(error as Error);
    }
  }

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

    const { route, params } = deps.resolveDefault();

    if (!route) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute resolved to empty",
        }),
      );
    }

    return this.navigate(route, params, opts);
  }

  navigateToNotFound(path: string): State {
    this.#abortPreviousNavigation();

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

  async #finishAsyncNavigation(
    guardCompletion: Promise<void>,
    nav: NavigationContext,
    controller: AbortController,
    myId: number,
  ): Promise<State> {
    const deps = this.#deps;
    const isActive = () =>
      this.#navigationId === myId &&
      !controller.signal.aborted &&
      deps.isActive();

    try {
      if (nav.opts.signal) {
        if (nav.opts.signal.aborted) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
            reason: nav.opts.signal.reason,
          });
        }

        nav.opts.signal.addEventListener(
          "abort",
          () => {
            controller.abort(nav.opts.signal?.reason);
          },
          { once: true, signal: controller.signal },
        );
      }

      await guardCompletion;

      if (!isActive()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      return completeTransition(deps, nav);
    } catch (error) {
      routeTransitionError(deps, error, nav.toState, nav.fromState);

      throw error;
    } finally {
      this.#cleanupController(controller);
    }
  }

  #handleNavigateError(
    error: unknown,
    controller: AbortController | null,
    transitionStarted: boolean,
    toState: State | undefined,
    fromState: State | undefined,
  ): void {
    if (controller) {
      this.#cleanupController(controller);
    }

    if (transitionStarted && toState) {
      routeTransitionError(this.#deps, error, toState, fromState);
    }
  }

  #cleanupController(controller: AbortController): void {
    controller.abort();

    if (this.#currentController === controller) {
      this.#currentController = null;
    }
  }

  #abortPreviousNavigation(): void {
    if (this.#deps.isTransitioning()) {
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use cloneRouter() to create isolated instance per request.",
      );
      this.#currentController?.abort(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      this.#deps.cancelNavigation();
    }
  }
}
