import { KeyIndexCache } from "./KeyIndexCache.js";

import type { CacheMetrics, CacheOptions } from "./types.js";

export class CacheManager {
  readonly #caches = new Map<
    string,
    { cache: KeyIndexCache<unknown>; options: CacheOptions<unknown> }
  >();

  /**
   * Create and register a named KeyIndexCache instance.
   * Throws if a cache with this name is already registered.
   *
   * Consumers: transitionPath ('path'), RouteUtils ('nodeState'), plugins ('prefetch' etc).
   */
  register<T>(name: string, options: CacheOptions<T>): KeyIndexCache<T> {
    if (this.#caches.has(name)) {
      throw new Error(`CacheManager: cache "${name}" is already registered`);
    }

    const cache = new KeyIndexCache<T>(options.maxSize);

    this.#caches.set(name, {
      cache: cache as KeyIndexCache<unknown>,
      options: options as CacheOptions<unknown>,
    });

    return cache;
  }

  /**
   * Remove a named cache from the registry and clear its contents.
   * No-op if the name is not registered.
   *
   * Consumer: plugin teardown — plugins unregister their caches on cleanup.
   */
  unregister(name: string): void {
    const entry = this.#caches.get(name);

    if (entry) {
      entry.cache.clear();
      this.#caches.delete(name);
    }
  }

  /**
   * Notify all registered caches that new routes were added.
   * Caches with `onInvalidate` receive targeted invalidation;
   * caches without it are fully cleared (safe default).
   *
   * Consumer: router.add() / router.addNode() after modifying the route tree.
   */
  invalidateForNewRoutes(newRouteNames: string[]): void {
    for (const { cache, options } of this.#caches.values()) {
      if (options.onInvalidate) {
        options.onInvalidate(cache, newRouteNames);
      } else {
        cache.clear();
      }
    }
  }

  /**
   * Clear all cache contents but keep registrations intact.
   *
   * Consumers: router.dispose(), test beforeEach setup, SSR per-request reset.
   */
  clear(): void {
    for (const { cache } of this.#caches.values()) {
      cache.clear();
    }
  }

  /**
   * Clear all cache contents and remove all registrations.
   * Idempotent — safe to call multiple times.
   *
   * Consumer: final cleanup, test beforeEach (full reset between tests).
   */
  dispose(): void {
    for (const { cache } of this.#caches.values()) {
      cache.clear();
    }

    this.#caches.clear();
  }

  /**
   * Return aggregated metrics for all registered caches.
   * New caches appear automatically — no DevTools update needed.
   *
   * Consumer: DevTools plugin — displays hit rates, sizes, cache utilization.
   */
  getMetrics(): Record<string, CacheMetrics> {
    const result: Record<string, CacheMetrics> = {};

    for (const [name, { cache }] of this.#caches) {
      result[name] = cache.getMetrics();
    }

    return result;
  }

  /**
   * Return names of all currently registered caches.
   *
   * Consumer: DevTools plugin — cache discovery and enumeration.
   */
  getCacheNames(): string[] {
    return [...this.#caches.keys()];
  }
}

export const cacheManager = new CacheManager();
