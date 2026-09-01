import { errorCodes, RouterError, UNKNOWN_ROUTE } from "@real-router/core";
import { freezeThrownError } from "@real-router/core/utils";

import { getRouteFromEvent, updateBrowserState } from "./popstate-utils.js";

import type { Browser, SharedFactoryState } from "./types.js";
import type { Params, Plugin, Router, SearchParams } from "@real-router/core";
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
  /**
   * The plugin's `createPluginBuildUrl`. The `search` slot is NOT optional
   * decoration: this type used to describe the pre-#1548 three-argument form
   * while the injected implementation had already shifted to
   * `(name, params, search, options)`. `{ hash }` is structurally a
   * `SearchParams`, so the narrower type accepted the call, silently landed the
   * fragment in the query slot and left `options` undefined — losing BOTH the
   * query and the hash on rollback (#1586). Keep the arity in step with
   * `createPluginBuildUrl`.
   */
  buildUrl: (
    name: string,
    params?: Params,
    search?: SearchParams,
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
  newHash: string | undefined,
): { hash?: string; force?: true; hashChange?: true } {
  // `newHash` is the fragment snapshotted at the event's fire time (#1210), or
  // `undefined` for plugins without hash support (hash-plugin) — the former
  // `!deps.getCurrentHash` guard, preserved.
  if (newHash === undefined) {
    return {};
  }

  const prevHash = deps.getCurrentContextHash
    ? deps.getCurrentContextHash()
    : "";
  const hashChange =
    newHash !== prevHash && deps.router.getState()?.path === matchedPath;

  return hashChange
    ? { hash: newHash, force: true, hashChange: true }
    : { hash: newHash };
}

/**
 * The popstate listener, plus the one piece of its state that outlives a single
 * event: the slot holding an event queued behind an in-flight transition.
 *
 * ⚠ Zero listeners is not an empty queue. The in-flight transition's `finally`
 * drains this slot unconditionally, so a queued event outlives teardown unless
 * a lifecycle empties it through {@link PopstateHandler.discard} (#1922).
 */
export interface PopstateHandler {
  (evt: PopStateEvent | HashChangeEvent): void;

  /**
   * Drops an event queued behind an in-flight transition, so the transition's
   * `finally` has nothing to replay. Idempotent, and scoped to this handler —
   * in a factory pool each plugin instance owns its own queue, so this never
   * touches another router's (#758 / #1213).
   */
  discard: () => void;
}

export function createPopstateHandler(
  deps: PopstateHandlerDeps,
): PopstateHandler {
  let isTransitioning = false;
  // Snapshot the route location alongside the event: a deferred popstate is
  // replayed only after the in-flight navigation's onTransitionSuccess →
  // replaceState has overwritten the live location, so re-reading it at
  // replay time would resolve the wrong target (#757).
  let deferred: {
    evt: PopStateEvent | HashChangeEvent;
    location: string;
    hash: string | undefined;
  } | null = null;

  function processDeferredEvent(): void {
    if (deferred) {
      const { evt, location, hash } = deferred;

      deferred = null;
      console.warn(
        `[${deps.loggerContext}] Processing deferred popstate event`,
      );
      void onPopState(evt, location, hash);
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
      currentState.search,
      ctxHash ? { hash: ctxHash } : undefined,
    );

    // ⚑ The four-channel PROJECTION, through the owner every other history
    // write in this plugin already uses (#1837). This wrote `currentState`
    // itself — the whole committed `State`, so `context` and `transition` went
    // into `history.state` too, on every guard-rejected Back, every SAME_STATES
    // popstate and every strict-mode unmatched URL.
    //
    // ⚠ `context` is the half that BREAKS rather than bloats: it is a public
    // plugin slot whose contents this plugin does not control, and a real
    // `replaceState` runs StructuredSerializeForStorage. A plugin publishing a
    // non-cloneable value made this throw into the empty `catch {}` around the
    // call, so the URL was never rolled back at all — silently. jsdom stores by
    // identity, which is why 360 tests never saw it.
    //
    // ⚠ `transition` is per-navigation metadata about a navigation that already
    // finished; persisting it means a Back to this entry restores a
    // `transition` describing a different one.
    //
    // ⚑ `updateBrowserState` rather than a third inline `{ name, params,
    // search, path }`: `popstate-utils` already owns that projection twice (here
    // and in `createUpdateBrowserState`'s reused buffer), and hash-plugin calls
    // the same function. A copy N+1 is how the four writers would drift.
    updateBrowserState(currentState, url, true, deps.browser);
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
    hash: string | undefined,
  ): Promise<void> {
    if (isTransitioning) {
      console.warn(
        `[${deps.loggerContext}] Transition in progress, deferring popstate event`,
      );
      deferred = { evt, location, hash };

      return;
    }

    isTransitioning = true;

    try {
      const restored = getRouteFromEvent(evt, deps.api, location);

      // ⚑ A restored entry naming `UNKNOWN_ROUTE` is a PERSISTED not-found, and
      // it takes the same branch a LIVE one does (#1837). Before this it took
      // the matched branch instead, because `isStateStrict` accepts a name in
      // core's `@@` namespace — deliberately, since that is what `UNKNOWN_ROUTE`
      // is — so `allowNotFound` was enforced on one of the two ways a 404
      // reaches this handler and not the other.
      //
      // ⚠ The entry is not adversarial: it is what THIS PLUGIN writes. Under
      // `allowNotFound: true` every unmatched URL persists one. Turn the option
      // off in the next deploy and Back to that entry still committed the 404
      // the option now forbids.
      //
      // ⚑ Routed rather than gated: adding a second `allowNotFound` check beside
      // the first would leave two places to keep in step. Sending it down the
      // existing branch means `allowNotFound: true` still restores (through
      // `navigateToNotFound`, with the #1448 same-state short-circuit) and
      // `false` reports `ROUTE_NOT_FOUND` and rolls the URL back — one rule,
      // whichever way the not-found arrived.
      const matched = restored?.name === UNKNOWN_ROUTE ? undefined : restored;

      if (matched) {
        // api.navigateToState — plugin-only entry point. Preserves
        // matchSourceTrailingSlash output and skips the redundant
        // forwardState/buildPath round-trip (#525). Hash augmentation (#532)
        // extracted into resolveHashOptions so this branch stays readable.
        await deps.api.navigateToState(matched, {
          ...deps.transitionOptions,
          ...resolveHashOptions(deps, matched.path, hash),
        });
      } else if (deps.allowNotFound) {
        // Same-state short-circuit (#1448): a popstate that resolves to the
        // UNKNOWN_ROUTE already committed for this exact path is a no-op — skip
        // the redundant navigateToNotFound so a storm of identical not-found
        // popstates collapses to a single commit. navigateToNotFound bypasses
        // the navigate pipeline, so it has no SAME_STATES guard of its own; this
        // restores parity with the matched-route branch, where a same-state
        // popstate is already suppressed by navigateToState's SAME_STATES check.
        const current = deps.router.getState();

        if (current?.name !== UNKNOWN_ROUTE || current.path !== location) {
          deps.router.navigateToNotFound(location);
        }
      } else {
        // Strict mode — unmatched URL is an error. Emit $$error and sync URL
        // back to the current router state (no silent fallback to defaultRoute).
        const err = freezeThrownError(
          new RouterError(errorCodes.ROUTE_NOT_FOUND, {
            path: location,
          }),
        );

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

  // Snapshot the location AND fragment the instant the event fires — before any
  // in-flight navigation can overwrite them via replaceState (#757 for the
  // path/query location; #1210 for the fragment). A deferred replay must resolve
  // the target the event referred to, not the live URL a since-committed
  // in-flight navigation rewrote. `getCurrentHash?.()` is undefined for
  // hash-less plugins (hash-plugin) — resolveHashOptions treats that as "no
  // hash augmentation", exactly as the old `!deps.getCurrentHash` guard did.
  const handler: PopstateHandler = (evt: PopStateEvent | HashChangeEvent) => {
    void onPopState(evt, deps.browser.getLocation(), deps.getCurrentHash?.());
  };

  handler.discard = () => {
    deferred = null;
  };

  return handler;
}

export interface PopstateLifecycleDeps {
  browser: Browser;
  shared: SharedFactoryState;
  handler: PopstateHandler;
  cleanup: () => void;
}

export function createPopstateLifecycle(
  deps: PopstateLifecycleDeps,
): Pick<Plugin, "onStart" | "onStop" | "teardown"> {
  // Captured at onStart so onStop/teardown clear the shared slot ONLY while we
  // still own it. In a factory pool a later router's onStart replaces the slot
  // (last-wins, #758); clearing it unconditionally on the earlier router's
  // stop/dispose would disconnect the LIVE router (#1213).
  let myRemover: (() => void) | undefined;

  return {
    onStart: () => {
      if (deps.shared.removePopStateListener) {
        deps.shared.removePopStateListener();
      }

      myRemover = deps.browser.addPopstateListener(deps.handler);
      deps.shared.removePopStateListener = myRemover;
    },

    onStop: () => {
      if (myRemover && deps.shared.removePopStateListener === myRemover) {
        deps.shared.removePopStateListener();
        deps.shared.removePopStateListener = undefined;
      }

      myRemover = undefined;
      // Unconditional, unlike the listener slot above: the queue is OURS in a
      // factory pool, whoever currently owns the shared listener (#1922).
      deps.handler.discard();
    },

    teardown: () => {
      if (myRemover && deps.shared.removePopStateListener === myRemover) {
        deps.shared.removePopStateListener();
        deps.shared.removePopStateListener = undefined;
      }

      myRemover = undefined;
      deps.handler.discard();
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
 * pair in ONE browser task — but a microtask checkpoint runs BETWEEN the two
 * listeners (Chromium order: `[popstate, microtask, hashchange, macrotask]`), so
 * the second still lands in the same task. Handling both double-navigates, so the
 * second of the pair is dropped. The two `saw*` flags are **type-scoped** and
 * **order-independent** — whichever of the pair arrives first is handled and
 * blocks the other, no matter which the browser fires first. They reset on a
 * **macrotask** (`setTimeout 0`), which fires AFTER the pair completes (never on
 * the microtask checkpoint mid-pair — that was #1228): the guard spans the whole
 * pair, distinct user gestures land in later macrotasks and are never coalesced,
 * and same-type bursts (two rapid `popstate`s → the deferred-event path) are
 * unaffected because a `popstate` only blocks a following `hashchange`, never
 * another `popstate`.
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

  // Reset on a MACROTASK, not a microtask (#1228). The pair fires in one browser
  // task, but a microtask checkpoint runs BETWEEN the two listeners — verified in
  // Chromium the order is [popstate, microtask, hashchange, macrotask]. A
  // queueMicrotask reset therefore cleared the flags before the pair's second
  // event, which then double-navigated → a phantom SAME_STATES on every hash
  // back/forward. A setTimeout(0) reset fires AFTER the pair completes (same
  // task, verified), so the guard spans the whole pair; distinct gestures land in
  // later macrotasks and are never coalesced.
  const scheduleReset = (): void => {
    if (resetScheduled) {
      return;
    }

    resetScheduled = true;
    setTimeout(() => {
      sawPopstate = false;
      sawHashchange = false;
      resetScheduled = false;
    }, 0);
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

  // Captured at onStart so onStop/teardown clear the shared slot ONLY while we
  // still own the combined remover — a later router's onStart replaces it
  // (last-wins, #758); clearing it unconditionally on the earlier router's
  // stop/dispose disconnects the LIVE router (#1213).
  let myRemover: (() => void) | undefined;

  const removeOwnListeners = (): void => {
    if (myRemover && deps.shared.removePopStateListener === myRemover) {
      deps.shared.removePopStateListener();
      deps.shared.removePopStateListener = undefined;
    }

    myRemover = undefined;
    // Unconditional, unlike the listener slot above: the queue is OURS in a
    // factory pool, whoever currently owns the shared listener (#1922).
    deps.handler.discard();
  };

  return {
    onStart: () => {
      // Unconditional last-wins removal of whatever's installed (#758) — onStart
      // must displace the previous router regardless of ownership.
      if (deps.shared.removePopStateListener) {
        deps.shared.removePopStateListener();
      }

      const removePopstate = deps.browser.addPopstateListener(onPopstate);
      const removeHashchange = deps.browser.addHashChangeListener(onHashchange);

      myRemover = () => {
        removePopstate();
        removeHashchange();
      };
      deps.shared.removePopStateListener = myRemover;
    },

    onStop: removeOwnListeners,

    teardown: () => {
      removeOwnListeners();
      deps.cleanup();
    },
  };
}
