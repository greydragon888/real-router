import { logger } from "@real-router/logger";

import {
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_ERROR,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
} from "./constants";
import {
  handleGuardError,
  routeTransitionError,
} from "./transition/errorHandling";
import { resolveRemainingGuards, runGuardPhase } from "./transition/guardPhase";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigationOptions,
} from "./validators";
import { errorCodes, constants } from "../../constants";
import { freezeStateInPlace } from "../../helpers";
import { RouterError } from "../../RouterError";
import { getTransitionPath, nameToIDs } from "../../transitionPath";

import type { NavigationDependencies } from "./types";
import type {
  GuardFn,
  NavigationOptions,
  Params,
  State,
  TransitionMeta,
} from "@real-router/types";

type MutableTransitionMeta = {
  -readonly [K in keyof TransitionMeta]: TransitionMeta[K];
};
type MutableState = Omit<State, "transition"> & {
  transition: MutableTransitionMeta;
};

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

  // eslint-disable-next-line sonarjs/cognitive-complexity -- inherent to optimistic sync/async branching
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

      if (
        fromState &&
        !opts.reload &&
        !opts.force &&
        deps.areStatesEqual(fromState, toState, false)
      ) {
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
        opts.reload,
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

        if (shouldDeactivate) {
          const asyncResult = runGuardPhase(
            canDeactivateFunctions,
            toDeactivate,
            errorCodes.CANNOT_DEACTIVATE,
            toState,
            fromState,
            signal,
            isCurrentNav,
          );

          if (asyncResult) {
            return this.#continueAsyncNavigation(
              asyncResult,
              {
                deactivate: toDeactivate.slice(asyncResult.remainingIndex),
                activate: shouldActivate ? toActivate : [],
              },
              {
                deactivate: canDeactivateFunctions,
                activate: canActivateFunctions,
              },
              {
                toState,
                fromState,
                opts,
                toDeactivate,
                toActivate,
                intersection,
              },

              controller,
              myId,
            );
          }
        }

        if (this.#navigationId !== myId || !deps.isActive()) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        if (shouldActivate) {
          const asyncResult = runGuardPhase(
            canActivateFunctions,
            toActivate,
            errorCodes.CANNOT_ACTIVATE,
            toState,
            fromState,
            signal,
            isCurrentNav,
          );

          if (asyncResult) {
            return this.#continueAsyncNavigation(
              asyncResult,
              {
                deactivate: [],
                activate: toActivate.slice(asyncResult.remainingIndex),
              },
              {
                deactivate: canDeactivateFunctions,
                activate: canActivateFunctions,
              },
              {
                toState,
                fromState,
                opts,
                toDeactivate,
                toActivate,
                intersection,
              },

              controller,
              myId,
            );
          }
        }

        if (this.#navigationId !== myId || !deps.isActive()) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        this.#cleanupController(controller);
      }

      this.lastSyncResolved = true;

      return Promise.resolve(
        this.#completeNavigation(
          toState,
          fromState,
          opts,
          toDeactivate,
          toActivate,
          intersection,
          canDeactivateFunctions,
        ),
      );
    } catch (error) {
      if (controller) {
        this.#cleanupController(controller);
      }

      if (transitionStarted && toState) {
        routeTransitionError(deps, error, toState, fromState);
      }

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

  async #continueAsyncNavigation(
    pending: { result: Promise<boolean>; errorCode: string; segment: string },
    remaining: { deactivate: string[]; activate: string[] },
    guards: {
      deactivate: Map<string, GuardFn>;
      activate: Map<string, GuardFn>;
    },
    nav: {
      toState: State;
      fromState: State | undefined;
      opts: NavigationOptions;
      toDeactivate: string[];
      toActivate: string[];
      intersection: string;
    },
    controller: AbortController,
    myId: number,
  ): Promise<State> {
    const deps = this.#deps;
    const isActive = () =>
      this.#navigationId === myId &&
      !controller.signal.aborted &&
      deps.isActive();

    try {
      // Link external signal to internal controller (deferred from sync path)
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

      let result: boolean;

      try {
        result = await pending.result;
      } catch (error: unknown) {
        handleGuardError(error, pending.errorCode, pending.segment);

        return undefined as never; // unreachable — handleGuardError returns never
      }

      if (!result) {
        throw new RouterError(pending.errorCode, { segment: pending.segment });
      }

      if (remaining.deactivate.length > 0) {
        await resolveRemainingGuards(
          guards.deactivate,
          remaining.deactivate,
          errorCodes.CANNOT_DEACTIVATE,
          nav.toState,
          nav.fromState,
          controller.signal,
          isActive,
        );
      }

      if (!isActive()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      if (remaining.activate.length > 0) {
        await resolveRemainingGuards(
          guards.activate,
          remaining.activate,
          errorCodes.CANNOT_ACTIVATE,
          nav.toState,
          nav.fromState,
          controller.signal,
          isActive,
        );
      }

      if (!isActive()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      return this.#completeNavigation(
        nav.toState,
        nav.fromState,
        nav.opts,
        nav.toDeactivate,
        nav.toActivate,
        nav.intersection,
        guards.deactivate,
      );
    } catch (error) {
      routeTransitionError(deps, error, nav.toState, nav.fromState);

      throw error;
    } finally {
      this.#cleanupController(controller);
    }
  }

  #completeNavigation(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
    toDeactivate: string[],
    toActivate: string[],
    intersection: string,
    canDeactivateFunctions: Map<string, GuardFn>,
  ): State {
    const deps = this.#deps;

    if (
      toState.name !== constants.UNKNOWN_ROUTE &&
      !deps.hasRoute(toState.name)
    ) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: toState.name,
      });

      deps.sendTransitionFail(toState, fromState, err);

      throw err;
    }

    if (fromState) {
      for (const name of toDeactivate) {
        if (!toActivate.includes(name) && canDeactivateFunctions.has(name)) {
          deps.clearCanDeactivate(name);
        }
      }
    }

    const mutableState = toState as MutableState;

    mutableState.transition = {
      phase: "activating",
      reason: "success",
      segments: {
        deactivated: toDeactivate,
        activated: toActivate,
        intersection,
      },
    };

    if (fromState?.name !== undefined) {
      mutableState.transition.from = fromState.name;
    }

    if (opts.reload !== undefined) {
      mutableState.transition.reload = opts.reload;
    }

    if (opts.redirected !== undefined) {
      mutableState.transition.redirected = opts.redirected;
    }

    const finalState = freezeStateInPlace(toState);

    deps.setState(finalState);

    const transitionOpts = opts.signal === undefined ? opts : stripSignal(opts);

    deps.sendTransitionDone(finalState, fromState, transitionOpts);

    return finalState;
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
