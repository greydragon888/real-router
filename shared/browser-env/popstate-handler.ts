import { RouterError } from "@real-router/core";

import { getRouteFromEvent } from "./popstate-utils.js";

import type { Browser, SharedFactoryState } from "./types.js";
import type { Params, Plugin, Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export interface PopstateHandlerDeps {
  router: Router;
  api: PluginApi;
  browser: Browser;
  allowNotFound: boolean;
  transitionOptions: {
    source: string;
    replace: true;
    forceDeactivate?: boolean;
  };
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

  function recoverFromCriticalError(error: unknown): void {
    console.error(
      `[${deps.loggerContext}] Critical error in onPopState`,
      error,
    );

    try {
      const currentState = deps.router.getState();

      /* v8 ignore next -- @preserve: router always has state after start(); defensive guard for edge cases */
      if (currentState) {
        const url = deps.buildUrl(currentState.name, currentState.params);

        deps.browser.replaceState(currentState, url);
      }
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
        await deps.router.navigateToDefault({
          ...deps.transitionOptions,
          reload: true,
          replace: true,
        });
      }
    } catch (error) {
      if (!(error instanceof RouterError)) {
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
