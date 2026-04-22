import { errorCodes, RouterError } from "@real-router/core";

import { getRouteFromEvent } from "./popstate-utils.js";

import type { Browser, SharedFactoryState } from "./types.js";
import type { Params, Plugin, Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Navigation options used by the popstate handler to trigger a
 * router.navigate() call from a back/forward event. `source` identifies
 * the origin of the transition to downstream context consumers;
 * `replace: true` keeps the history stack in sync with the browser.
 */
export interface PopstateTransitionOptions {
  source: string;
  replace: true;
  forceDeactivate?: boolean;
}

export interface PopstateHandlerDeps {
  router: Router;
  api: PluginApi;
  browser: Browser;
  allowNotFound: boolean;
  transitionOptions: PopstateTransitionOptions;
  loggerContext: string;
  buildUrl: (name: string, params?: Params) => string;
}

export function createPopstateHandler(
  deps: PopstateHandlerDeps,
): (evt: PopStateEvent) => void {
  let isTransitioning = false;
  let deferredEvent: PopStateEvent | null = null;

  function processDeferredEvent(): void {
    if (deferredEvent) {
      const evt = deferredEvent;

      deferredEvent = null;
      console.warn(
        `[${deps.loggerContext}] Processing deferred popstate event`,
      );
      void onPopState(evt);
    }
  }

  function rollbackUrlToCurrentState(): void {
    const currentState = deps.router.getState();

    /* v8 ignore next -- @preserve: router always has state after start(); defensive guard for edge cases */
    if (!currentState) {
      return;
    }

    const url = deps.buildUrl(currentState.name, currentState.params);

    deps.browser.replaceState(currentState, url);
  }

  function recoverFromCriticalError(error: unknown): void {
    console.error(
      `[${deps.loggerContext}] Critical error in onPopState`,
      error,
    );

    try {
      rollbackUrlToCurrentState();
    } catch (recoveryError) {
      console.error(
        `[${deps.loggerContext}] Failed to recover from critical error`,
        recoveryError,
      );
    }
  }

  async function onPopState(evt: PopStateEvent): Promise<void> {
    if (isTransitioning) {
      console.warn(
        `[${deps.loggerContext}] Transition in progress, deferring popstate event`,
      );
      deferredEvent = evt;

      return;
    }

    isTransitioning = true;

    try {
      const route = getRouteFromEvent(evt, deps.api, deps.browser);

      if (route) {
        await deps.router.navigate(
          route.name,
          route.params,
          deps.transitionOptions,
        );
      } else if (deps.allowNotFound) {
        deps.router.navigateToNotFound(deps.browser.getLocation());
      } else {
        // Strict mode — unmatched URL is an error. Emit $$error and sync URL
        // back to the current router state (no silent fallback to defaultRoute).
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          path: deps.browser.getLocation(),
        });

        deps.api.emitTransitionError(err);
        rollbackUrlToCurrentState();
      }
    } catch (error) {
      if (error instanceof RouterError) {
        // navigate() already emitted $$error — just sync URL with router state.
        // Swallow rollback errors: teardown races may remove router.buildUrl
        // while a popstate event is still queued.
        try {
          rollbackUrlToCurrentState();
        } catch {
          // noop — nothing safe to do here
        }
      } else {
        recoverFromCriticalError(error);
      }
    } finally {
      isTransitioning = false;
      processDeferredEvent();
    }
  }

  return (evt: PopStateEvent) => void onPopState(evt);
}

export interface PopstateLifecycleDeps {
  browser: Browser;
  shared: SharedFactoryState;
  handler: (evt: PopStateEvent) => void;
  cleanup: () => void;
}

export function createPopstateLifecycle(
  deps: PopstateLifecycleDeps,
): Pick<Plugin, "onStart" | "onStop" | "teardown"> {
  return {
    onStart: () => {
      if (deps.shared.removePopStateListener) {
        deps.shared.removePopStateListener();
      }

      deps.shared.removePopStateListener = deps.browser.addPopstateListener(
        deps.handler,
      );
    },

    onStop: () => {
      if (deps.shared.removePopStateListener) {
        deps.shared.removePopStateListener();
        deps.shared.removePopStateListener = undefined;
      }
    },

    teardown: () => {
      if (deps.shared.removePopStateListener) {
        deps.shared.removePopStateListener();
        deps.shared.removePopStateListener = undefined;
      }

      deps.cleanup();
    },
  };
}
