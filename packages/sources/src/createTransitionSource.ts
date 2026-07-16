import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";
import { noopDestroy } from "./internal/noopDestroy.js";
import { stabilizeState } from "./stabilizeState.js";

import type { RouterTransitionSnapshot, RouterSource } from "./types.js";
import type { Router, State } from "@real-router/core";

// Frozen so accidental consumer mutation (`source.getSnapshot().toRoute = X`)
// throws in strict mode. The singleton ref is shared across every IDLE state
// for the lifetime of the process — mutating it would corrupt the contract
// "all IDLE snapshots are the same object reference" relied on by every
// adapter's useSyncExternalStore equivalent.
const IDLE_SNAPSHOT: RouterTransitionSnapshot = Object.freeze({
  isTransitioning: false,
  isLeaveApproved: false,
  toRoute: null,
  fromRoute: null,
});

const transitionSourceCache = new WeakMap<
  Router,
  RouterSource<RouterTransitionSnapshot>
>();

/**
 * @internal test-only export — returns the next snapshot for a TRANSITION_START
 * payload, or `null` when the same-paths dedup guard should suppress the
 * update. Exported so the (structurally-unreachable after #605) guard can be
 * exercised by unit tests without resorting to private-API hacks.
 */
export function nextTransitionStartSnapshot(
  prev: RouterTransitionSnapshot,
  toState: State,
  fromState: State | undefined,
): RouterTransitionSnapshot | null {
  const newToRoute = stabilizeState(prev.toRoute, toState);
  const newFromRoute = stabilizeState(prev.fromRoute, fromState ?? null);

  if (
    prev.isTransitioning &&
    newToRoute === prev.toRoute &&
    newFromRoute === prev.fromRoute
  ) {
    return null;
  }

  return {
    isTransitioning: true,
    isLeaveApproved: false,
    toRoute: newToRoute,
    fromRoute: newFromRoute,
  };
}

/**
 * @internal test-only export — analogous to {@link nextTransitionStartSnapshot}
 * for the LEAVE_APPROVE payload. The guard is structurally unreachable in
 * practice (router emits LEAVE_APPROVE exactly once per pipeline) but stays
 * for plugin-driven re-entrant flows.
 */
export function nextLeaveApproveSnapshot(
  prev: RouterTransitionSnapshot,
  toState: State,
  fromState: State | undefined,
): RouterTransitionSnapshot | null {
  const newToRoute = stabilizeState(prev.toRoute, toState);
  const newFromRoute = stabilizeState(prev.fromRoute, fromState ?? null);

  if (
    prev.isLeaveApproved &&
    newToRoute === prev.toRoute &&
    newFromRoute === prev.fromRoute
  ) {
    return null;
  }

  return {
    isTransitioning: true,
    isLeaveApproved: true,
    toRoute: newToRoute,
    fromRoute: newFromRoute,
  };
}

export function createTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  // Declared before `source` so its onDestroy closure closes over an
  // initialized binding — a mid-registration throw below no longer leaves it
  // in the TDZ, keeping the source destroyable (#1440).
  const unsubs: (() => void)[] = [];

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

  const onTransitionStart = (toState: State, fromState?: State): void => {
    // The same-paths dedup branch inside nextTransitionStartSnapshot is
    // structurally unreachable after #605 (every router-emitted
    // TRANSITION_START carries a fresh State per navigate()), but the
    // helper is kept testable for future stabilizer changes — see the
    // direct unit test in createTransitionSource.test.ts.
    const next = nextTransitionStartSnapshot(
      source.getSnapshot(),
      toState,
      fromState,
    );

    /* v8 ignore next 3 -- @preserve: dedup-skip branch unreachable through
       normal router flow; covered directly via nextTransitionStartSnapshot
       unit test. */
    if (next === null) {
      return;
    }

    source.updateSnapshot(next);
  };

  const onLeaveApprove = (toState: State, fromState?: State): void => {
    const next = nextLeaveApproveSnapshot(
      source.getSnapshot(),
      toState,
      fromState,
    );

    /* v8 ignore next 3 -- @preserve: dedup-skip branch unreachable through
       normal router flow (LEAVE_APPROVE fires once per pipeline); covered
       directly via nextLeaveApproveSnapshot unit test. */
    if (next === null) {
      return;
    }

    source.updateSnapshot(next);
  };

  // Eager connection: subscribe to router events immediately. Register
  // one-by-one so a throw mid-registration (the emitter rejects a duplicate
  // listener / hits its maxListeners cap) unwinds the already-registered
  // listeners instead of leaking them and stranding the half-wired source
  // (#1440). Mirrors @real-router/rx's events$ partial-registration safety.
  /* eslint-disable unicorn/prefer-single-call -- register one-by-one so a
     mid-registration throw unwinds the already-pushed unsubs; a single
     push(a, b) evaluates every addEventListener arg BEFORE pushing, leaving an
     earlier registration untracked and leaked (#1440). */
  try {
    unsubs.push(
      api.addEventListener(events.TRANSITION_START, onTransitionStart),
    );
    unsubs.push(
      api.addEventListener(events.TRANSITION_LEAVE_APPROVE, onLeaveApprove),
    );
    unsubs.push(api.addEventListener(events.TRANSITION_SUCCESS, resetToIdle));
    unsubs.push(api.addEventListener(events.TRANSITION_ERROR, resetToIdle));
    unsubs.push(api.addEventListener(events.TRANSITION_CANCEL, resetToIdle));
  } catch (error) {
    for (const unsub of unsubs) {
      unsub();
    }

    throw error;
  }
  /* eslint-enable unicorn/prefer-single-call */

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
