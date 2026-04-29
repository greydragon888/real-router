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
  buildUrl: (
    name: string,
    params?: Params,
    options?: { hash?: string },
  ) => string;
  /**
   * Decoded hash of the current browser location (no leading "#"). Defaults
   * to a no-op (returns "") for plugins that do not participate in URL
   * fragment tracking — namely hash-plugin, where `#` is the route delimiter.
   * (#532)
   */
  getCurrentHash?: () => string;
  /**
   * Decoded hash from the previous transition's `state.context.url.hash`
   * (no leading "#"). Used by the popstate handler to detect hash-only
   * navigation and add `force: true, hashChange: true` to bypass SAME_STATES.
   * Defaults to no-op (returns "") for hash-plugin. (#532)
   */
  getCurrentContextHash?: () => string;
}

/**
 * Hash augmentation for popstate-driven navigateToState (#532).
 * Returns a partial options object that the caller spreads on top of
 * `deps.transitionOptions`. When the handler is wired without hash support
 * (hash-plugin), both deps default to undefined and an empty object is
 * returned — preserving the legacy behavior for that plugin.
 */
function resolveHashOptions(
  deps: PopstateHandlerDeps,
  matchedPath: string,
): { hash?: string; force?: true; hashChange?: true } {
  if (!deps.getCurrentHash) {
    return {};
  }

  const newHash = deps.getCurrentHash();
  const prevHash = deps.getCurrentContextHash
    ? deps.getCurrentContextHash()
    : "";
  const hashChange =
    newHash !== prevHash && deps.router.getState()?.path === matchedPath;

  return hashChange
    ? { hash: newHash, force: true, hashChange: true }
    : { hash: newHash };
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

    // Preserve hash on rollback so guard rejection / unmatched URL on
    // popstate doesn't strip the fragment from the visible URL (#532).
    const ctxHash = (
      currentState.context as { url?: { hash?: string } } | undefined
    )?.url?.hash;
    const url = deps.buildUrl(
      currentState.name,
      currentState.params,
      ctxHash ? { hash: ctxHash } : undefined,
    );

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
      const matched = getRouteFromEvent(evt, deps.api, deps.browser);

      if (matched) {
        // api.navigateToState — plugin-only entry point. Preserves
        // matchSourceTrailingSlash output and skips the redundant
        // forwardState/buildPath round-trip (#525). Hash augmentation (#532)
        // extracted into resolveHashOptions so this branch stays readable.
        await deps.api.navigateToState(matched, {
          ...deps.transitionOptions,
          ...resolveHashOptions(deps, matched.path),
        });
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
