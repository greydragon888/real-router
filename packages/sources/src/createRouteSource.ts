import type { RouteSnapshot, RouterSource } from "./types.js";
import type { Router } from "@real-router/types";

class RouteSource implements RouterSource<RouteSnapshot> {
  #routerUnsubscribe: (() => void) | null = null;
  #currentSnapshot: RouteSnapshot;

  readonly #listeners = new Set<() => void>();
  readonly #router: Router;

  constructor(router: Router) {
    this.#router = router;

    this.#currentSnapshot = {
      route: router.getState(),
      previousRoute: undefined,
    };

    this.subscribe = this.subscribe.bind(this);
    this.destroy = this.destroy.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  subscribe(listener: () => void): () => void {
    if (this.#listeners.size === 0) {
      // Connect to router on first subscription
      this.#routerUnsubscribe = this.#router.subscribe((next) => {
        this.#currentSnapshot = {
          route: next.route,
          previousRoute: next.previousRoute,
        };
        this.#listeners.forEach((cb) => {
          cb();
        });
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

  getSnapshot(): RouteSnapshot {
    return this.#currentSnapshot;
  }

  destroy(): void {
    if (this.#routerUnsubscribe) {
      this.#routerUnsubscribe();
      this.#routerUnsubscribe = null;
    }

    this.#listeners.clear();
  }
}

/**
 * Creates a source for the full route state.
 *
 * Uses a lazy-connection pattern: the router subscription is created when the
 * first listener subscribes and removed when the last listener unsubscribes.
 * This is compatible with React's useSyncExternalStore and Strict Mode.
 */
export function createRouteSource(router: Router): RouterSource<RouteSnapshot> {
  return new RouteSource(router);
}
