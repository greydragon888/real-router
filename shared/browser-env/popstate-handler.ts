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
): (evt: PopStateEvent | HashChangeEvent) => void {
  let isTransitioning = false;
  // Snapshot the route location alongside the event: a deferred popstate is
  // replayed only after the in-flight navigation's onTransitionSuccess →
  // replaceState has overwritten the live location, so re-reading it at
  // replay time would resolve the wrong target (#757).
  let deferred: {
    evt: PopStateEvent | HashChangeEvent;
    location: string;
  } | null = null;

  function processDeferredEvent(): void {
    if (deferred) {
      const { evt, location } = deferred;

      deferred = null;
      console.warn(
        `[${deps.loggerContext}] Processing deferred popstate event`,
      );
      void onPopState(evt, location);
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

  async function onPopState(
    evt: PopStateEvent | HashChangeEvent,
    location: string,
  ): Promise<void> {
    if (isTransitioning) {
      console.warn(
        `[${deps.loggerContext}] Transition in progress, deferring popstate event`,
      );
      deferred = { evt, location };

      return;
    }

    isTransitioning = true;

    try {
      const matched = getRouteFromEvent(evt, deps.api, location);

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
        deps.router.navigateToNotFound(location);
      } else {
        // Strict mode — unmatched URL is an error. Emit $$error and sync URL
        // back to the current router state (no silent fallback to defaultRoute).
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          path: location,
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

  // Snapshot the location the instant the event fires — before any in-flight
  // navigation can overwrite it via replaceState (#757).
  return (evt: PopStateEvent | HashChangeEvent) =>
    void onPopState(evt, deps.browser.getLocation());
}

export interface PopstateLifecycleDeps {
  browser: Browser;
  shared: SharedFactoryState;
  handler: (evt: PopStateEvent | HashChangeEvent) => void;
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

/**
 * Lifecycle for hash-plugin (#759): syncs the router with the URL fragment on
 * BOTH `popstate` (back/forward) and `hashchange` (external fragment changes —
 * native anchors, address-bar edits, `location.hash = ...`). browser-plugin
 * keeps `createPopstateLifecycle` (popstate only) — for it a path change is a
 * full navigation, and `hashchange` would be noise.
 *
 * Dedup: a hash-changing history traversal fires the `popstate`+`hashchange`
 * pair synchronously (one browser task). Handling both double-navigates, so the
 * second of the pair is dropped. The two `saw*` flags are **type-scoped** and
 * **order-independent** — whichever of the pair arrives first is handled and
 * blocks the other, no matter which the browser fires first. They reset on a
 * microtask, so the guard spans only the synchronous pair: distinct user
 * gestures land in separate tasks and are never coalesced, and same-type bursts
 * (two rapid `popstate`s → the deferred-event path) are unaffected because a
 * `popstate` only blocks a following `hashchange`, never another `popstate`.
 *
 * Both listeners are stored under the single `shared.removePopStateListener`
 * slot as a combined remover, preserving the factory-pool last-wins cleanup
 * (#758) unchanged.
 */
export function createHashSyncLifecycle(
  deps: PopstateLifecycleDeps,
): Pick<Plugin, "onStart" | "onStop" | "teardown"> {
  let sawPopstate = false;
  let sawHashchange = false;
  let resetScheduled = false;

  const scheduleReset = (): void => {
    if (resetScheduled) {
      return;
    }

    resetScheduled = true;
    queueMicrotask(() => {
      sawPopstate = false;
      sawHashchange = false;
      resetScheduled = false;
    });
  };

  const onPopstate = (evt: PopStateEvent): void => {
    // The paired hashchange already handled this traversal — drop the popstate.
    if (sawHashchange) {
      return;
    }

    sawPopstate = true;
    scheduleReset();
    deps.handler(evt);
  };

  const onHashchange = (evt: HashChangeEvent): void => {
    // The paired popstate already handled this traversal — drop the hashchange.
    if (sawPopstate) {
      return;
    }

    sawHashchange = true;
    scheduleReset();
    deps.handler(evt);
  };

  const removeListeners = (): void => {
    if (deps.shared.removePopStateListener) {
      deps.shared.removePopStateListener();
      deps.shared.removePopStateListener = undefined;
    }
  };

  return {
    onStart: () => {
      removeListeners();

      const removePopstate = deps.browser.addPopstateListener(onPopstate);
      const removeHashchange = deps.browser.addHashChangeListener(onHashchange);

      deps.shared.removePopStateListener = () => {
        removePopstate();
        removeHashchange();
      };
    },

    onStop: removeListeners,

    teardown: () => {
      removeListeners();
      deps.cleanup();
    },
  };
}
