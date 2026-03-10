import { computeSnapshot } from "./computeSnapshot.js";
import { getCachedShouldUpdate } from "./shouldUpdateCache.js";

import type { RouteNodeSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/core";

class RouteNodeSource implements RouterSource<RouteNodeSnapshot> {
  #routerUnsubscribe: (() => void) | null = null;
  #currentSnapshot: RouteNodeSnapshot;
  #destroyed = false;

  readonly #listeners = new Set<() => void>();
  readonly #router: Router;
  readonly #nodeName: string;
  readonly #shouldUpdate: ReturnType<typeof getCachedShouldUpdate>;

  constructor(router: Router, nodeName: string) {
    this.#router = router;
    this.#nodeName = nodeName;
    this.#shouldUpdate = getCachedShouldUpdate(router, nodeName);

    const initialSnapshot: RouteNodeSnapshot = {
      route: undefined,
      previousRoute: undefined,
    };

    this.#currentSnapshot = computeSnapshot(initialSnapshot, router, nodeName);

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  subscribe(listener: () => void): () => void {
    if (this.#destroyed) {
      return () => {};
    }

    if (this.#listeners.size === 0) {
      // Reconcile snapshot with current router state before connecting.
      // Covers reconnection after Activity hide/show cycles where the
      // source was disconnected and missed navigation events.
      this.#currentSnapshot = computeSnapshot(
        this.#currentSnapshot,
        this.#router,
        this.#nodeName,
      );

      // Connect to router on first subscription
      this.#routerUnsubscribe = this.#router.subscribe((next) => {
        if (!this.#shouldUpdate(next.route, next.previousRoute)) {
          return;
        }

        const newSnapshot = computeSnapshot(
          this.#currentSnapshot,
          this.#router,
          this.#nodeName,
          next,
        );

        /* v8 ignore next 3 -- @preserve: dedup guard; shouldUpdateNode filters accurately so computeSnapshot always returns new ref */
        if (!Object.is(this.#currentSnapshot, newSnapshot)) {
          this.#currentSnapshot = newSnapshot;
          this.#listeners.forEach((cb) => {
            cb();
          });
        }
      });
    }

    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);

      if (this.#listeners.size === 0 && this.#routerUnsubscribe) {
        this.#routerUnsubscribe();
        this.#routerUnsubscribe = null;
      }
    };
  }

  getSnapshot(): RouteNodeSnapshot {
    return this.#currentSnapshot;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;

    if (this.#routerUnsubscribe) {
      this.#routerUnsubscribe();
      this.#routerUnsubscribe = null;
    }

    this.#listeners.clear();
  }
}

/**
 * Creates a source scoped to a specific route node.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 */
export function createRouteNodeSource(
  router: Router,
  nodeName: string,
): RouterSource<RouteNodeSnapshot> {
  return new RouteNodeSource(router, nodeName);
}
