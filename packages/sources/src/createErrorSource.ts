import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { BaseSource } from "./BaseSource";
import { noopDestroy } from "./internal/noopDestroy.js";

import type { RouterErrorSnapshot, RouterSource } from "./types.js";
import type { Router, State, RouterError } from "@real-router/core";

// Frozen shared singleton — returned by every error source's getSnapshot()
// until the first error. Mirrors createTransitionSource's IDLE_SNAPSHOT: a
// consumer mutating it would corrupt the shared singleton for every error
// source of every router (#768).
const INITIAL_SNAPSHOT: RouterErrorSnapshot = Object.freeze({
  error: null,
  toRoute: null,
  fromRoute: null,
  version: 0,
});

const errorSourceCache = new WeakMap<
  Router,
  RouterSource<RouterErrorSnapshot>
>();

export function createErrorSource(
  router: Router,
): RouterSource<RouterErrorSnapshot> {
  let errorVersion = 0;
  let hasError = false;

  const source = new BaseSource(INITIAL_SNAPSHOT, {
    onDestroy: () => {
      for (const unsub of unsubs) {
        unsub();
      }
    },
  });

  const api = getPluginApi(router);

  // Eager connection: subscribe to router events immediately
  const unsubs = [
    api.addEventListener(
      events.TRANSITION_ERROR,
      (
        toState: State | undefined,
        fromState: State | undefined,
        err: RouterError,
      ) => {
        errorVersion++;
        hasError = true;
        source.updateSnapshot({
          error: err,
          toRoute: toState ?? null,
          /* v8 ignore next -- @preserve: fromState undefined only during start() error; unreachable via navigate() */
          fromRoute: fromState ?? null,
          version: errorVersion,
        });
      },
    ),
    api.addEventListener(events.TRANSITION_SUCCESS, () => {
      // Skip if no error — avoids unnecessary re-renders.
      // BaseSource.updateSnapshot() always notifies listeners (new object = new ref),
      // and useSyncExternalStore compares via Object.is().
      if (hasError) {
        hasError = false;
        source.updateSnapshot({
          error: null,
          toRoute: null,
          fromRoute: null,
          version: errorVersion,
        });
      }
    }),
  ];

  return source;
}

/**
 * Returns a per-router cached error source shared across all consumers.
 *
 * Safe to call destroy() — the cached source ignores external destroy() calls
 * and lives until the router itself is garbage-collected (the WeakMap entry
 * releases automatically).
 *
 * Use this in framework adapters (React/Preact/Solid/Vue/Svelte/Angular) to
 * share a single ErrorSource instance across all mount/unmount cycles.
 *
 * For isolated/advanced use (ad-hoc, short-lived, per-owner teardown), call
 * `createErrorSource(router)` directly — it returns a fresh instance with a
 * working `destroy()`.
 */
export function getErrorSource(
  router: Router,
): RouterSource<RouterErrorSnapshot> {
  let cached = errorSourceCache.get(router);

  if (!cached) {
    const source = createErrorSource(router);

    // Wrap with no-op destroy. The underlying source is shared across all
    // consumers; letting any one consumer call destroy() would tear it down
    // for the rest. The source lives as long as the router (WeakMap key).
    cached = {
      subscribe: source.subscribe,
      getSnapshot: source.getSnapshot,
      destroy: noopDestroy,
    };
    errorSourceCache.set(router, cached);
  }

  return cached;
}

/**
 * Eagerly create (and thus subscribe) the per-router error source IF the router
 * supports the plugin API — used by framework adapters' `RouterProvider` to
 * capture a navigation error that fires BEFORE a `RouterErrorBoundary` mounts
 * (#778). A router-like without an internals-registry entry (a test stub, an
 * `Object.create`-derived object, or anything not produced by `createRouter`)
 * makes `getErrorSource` throw via `getPluginApi`; here that degrades to a no-op.
 *
 * The asymmetry is deliberate: `createRouteSource` tolerates such routers (it is
 * lazy and only touches `router.subscribe`), so a Provider that eagerly primes
 * the stricter error source must not crash where the route source would not. A
 * boundary mounting later still creates the error source lazily and surfaces a
 * genuine invalid-router error there.
 */
export function primeErrorSource(router: Router): void {
  try {
    getErrorSource(router);
  } catch {
    // Router has no internals-registry entry — nothing to prime eagerly.
  }
}
