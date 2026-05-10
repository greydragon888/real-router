import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";
import { stabilizeState } from "./stabilizeState.js";

import type { RouterTransitionSnapshot, RouterSource } from "./types.js";
import type { Router, State } from "@real-router/core";

const IDLE_SNAPSHOT: RouterTransitionSnapshot = {
  isTransitioning: false,
  isLeaveApproved: false,
  toRoute: null,
  fromRoute: null,
};

const transitionSourceCache = new WeakMap<
  Router,
  RouterSource<RouterTransitionSnapshot>
>();

export function createTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  const source = new BaseSource(IDLE_SNAPSHOT, {
    onDestroy: () => {
      for (const unsub of unsubs) {
        unsub();
      }
    },
  });

  const api = getPluginApi(router);

  const resetToIdle = (): void => {
    source.updateSnapshot(IDLE_SNAPSHOT);
  };

  // Eager connection: subscribe to router events immediately
  const unsubs = [
    api.addEventListener(
      events.TRANSITION_START,
      (toState: State, fromState?: State) => {
        const prev = source.getSnapshot();
        const newToRoute = stabilizeState(prev.toRoute, toState);
        const newFromRoute = stabilizeState(prev.fromRoute, fromState ?? null);

        // Guard against redundant updates when both routes stabilize to
        // prev refs AND we're already transitioning. With #605, reload
        // navs return fresh refs via stabilizeState, so this short-circuit
        // mostly idles — kept for defensive correctness.
        /* v8 ignore next 5 -- @preserve: structurally unreachable after #605 —
           every TRANSITION_START fires with a fresh State (router builds a
           new toState per navigate()), so newToRoute !== prev.toRoute holds
           even on idempotent retry paths the router itself prevents. Guard
           remains for future stabilizer changes. */
        if (
          prev.isTransitioning &&
          newToRoute === prev.toRoute &&
          newFromRoute === prev.fromRoute
        ) {
          return;
        }

        source.updateSnapshot({
          isTransitioning: true,
          isLeaveApproved: false,
          toRoute: newToRoute,
          fromRoute: newFromRoute,
        });
      },
    ),
    api.addEventListener(
      events.TRANSITION_LEAVE_APPROVE,
      (toState: State, fromState?: State) => {
        const prev = source.getSnapshot();
        const newToRoute = stabilizeState(prev.toRoute, toState);
        const newFromRoute = stabilizeState(prev.fromRoute, fromState ?? null);

        /* v8 ignore next 7 -- @preserve: defensive guard — the router emits
           TRANSITION_LEAVE_APPROVE once per navigation pipeline (after
           deactivation guards pass, before activation guards run), so a
           same-paths duplicate LEAVE_APPROVE is structurally unreachable.
           Guard remains so plugin-driven re-entrant flows can't allocate
           duplicate snapshot literals. */
        if (
          prev.isLeaveApproved &&
          newToRoute === prev.toRoute &&
          newFromRoute === prev.fromRoute
        ) {
          return;
        }

        source.updateSnapshot({
          isTransitioning: true,
          isLeaveApproved: true,
          toRoute: newToRoute,
          fromRoute: newFromRoute,
        });
      },
    ),
    api.addEventListener(events.TRANSITION_SUCCESS, resetToIdle),
    api.addEventListener(events.TRANSITION_ERROR, resetToIdle),
    api.addEventListener(events.TRANSITION_CANCEL, resetToIdle),
  ];

  return source;
}

/**
 * Returns a per-router cached transition source shared across all consumers.
 *
 * Safe to call destroy() — the cached source ignores external destroy() calls
 * and lives until the router itself is garbage-collected (the WeakMap entry
 * releases automatically).
 *
 * Use this in framework adapters (React/Preact/Solid/Vue/Svelte/Angular) to
 * share a single TransitionSource instance across all mount/unmount cycles.
 *
 * For isolated/advanced use (ad-hoc, short-lived, per-owner teardown), call
 * `createTransitionSource(router)` directly — it returns a fresh instance with
 * a working `destroy()`.
 */
export function getTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  let cached = transitionSourceCache.get(router);

  if (!cached) {
    const source = createTransitionSource(router);

    // Wrap with no-op destroy. The underlying source is shared across all
    // consumers; letting any one consumer call destroy() would tear it down
    // for the rest. The source lives as long as the router (WeakMap key).
    cached = {
      subscribe: source.subscribe,
      getSnapshot: source.getSnapshot,
      destroy: noopDestroy,
    };
    transitionSourceCache.set(router, cached);
  }

  return cached;
}

function noopDestroy(): void {
  // Shared cached source — external destroy() is a no-op.
}
