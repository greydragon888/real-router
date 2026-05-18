import { BaseSource } from "./BaseSource";
import { getErrorSource } from "./createErrorSource";
import { noopDestroy } from "./internal/noopDestroy.js";

import type { DismissableErrorSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/core";

const dismissableCache = new WeakMap<
  Router,
  RouterSource<DismissableErrorSnapshot>
>();

/**
 * Returns a per-router cached source that wraps `getErrorSource(router)` with
 * an integrated "dismissed" version counter, exposing a single reactive
 * snapshot `{ error, toRoute, fromRoute, version, resetError }`.
 *
 * Each `RouterErrorBoundary` in a framework adapter subscribes to this one
 * source instead of re-implementing the `dismissedVersion` state pattern
 * locally. The 6-copy duplicate across adapters collapses to this helper.
 *
 * **Semantics:**
 * - `error` is non-null only when `underlying.version > dismissedVersion`.
 * - `resetError()` sets `dismissedVersion = current underlying version`,
 *   immediately clearing `error` to `null` and notifying all listeners.
 * - A subsequent `TRANSITION_ERROR` advances `version` beyond `dismissedVersion`,
 *   so `error` becomes non-null again — no additional plumbing needed.
 *
 * **Cached:** one instance per router. `destroy()` on the returned source is
 * a no-op. Shared across all `RouterErrorBoundary` consumers.
 */
export function createDismissableError(
  router: Router,
): RouterSource<DismissableErrorSnapshot> {
  const cached = dismissableCache.get(router);

  if (cached) {
    return cached;
  }

  const errorSource = getErrorSource(router);

  let dismissedVersion = -1;
  // Hoisted up here so the `onFirstSubscribe` closure below can read/write
  // it before `disconnect()`'s declaration. JS hoisting makes the original
  // post-declaration order legal, but reading top-to-bottom is clearer.
  let unsubFromError: (() => void) | null = null;

  const buildDismissableSnapshot = (): DismissableErrorSnapshot => {
    const snap = errorSource.getSnapshot();
    const isDismissed = snap.version <= dismissedVersion;

    return {
      error: isDismissed ? null : snap.error,
      toRoute: isDismissed ? null : snap.toRoute,
      fromRoute: isDismissed ? null : snap.fromRoute,
      version: snap.version,
      resetError,
    };
  };

  const source = new BaseSource<DismissableErrorSnapshot>(
    buildDismissableSnapshot(),
    {
      onFirstSubscribe: () => {
        unsubFromError = errorSource.subscribe(() => {
          source.updateSnapshot(buildDismissableSnapshot());
        });
      },
      onLastUnsubscribe: () => {
        disconnect();
      },
    },
  );

  function resetError(): void {
    const currentVersion = errorSource.getSnapshot().version;

    // No-op guard: if we already dismissed at this version (or are even ahead
    // of the live error stream), there's nothing to clear. Skipping prevents
    // a redundant snapshot allocation + listener notification under tight
    // resetError(); resetError() patterns — common when a RouterErrorBoundary
    // user clicks "dismiss" while another dismiss is already in flight.
    if (currentVersion <= dismissedVersion) {
      return;
    }

    dismissedVersion = currentVersion;
    source.updateSnapshot(buildDismissableSnapshot());
  }

  function disconnect(): void {
    const unsub = unsubFromError;

    unsubFromError = null;
    unsub?.();
  }

  const wrapper: RouterSource<DismissableErrorSnapshot> = {
    subscribe: source.subscribe,
    getSnapshot: source.getSnapshot,
    destroy: noopDestroy,
  };

  dismissableCache.set(router, wrapper);

  return wrapper;
}
