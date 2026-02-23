import { KeyIndexCache } from "./KeyIndexCache.js";

import type { CacheMetrics, CacheOptions } from "./types.js";

export class CacheManager {
  #caches = new Map<
    string,
    { cache: KeyIndexCache<unknown>; options: CacheOptions<unknown> }
  >();

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

  unregister(name: string): void {
    const entry = this.#caches.get(name);

    if (entry) {
      entry.cache.clear();
      this.#caches.delete(name);
    }
  }

  invalidateForNewRoutes(newRouteNames: string[]): void {
    for (const { cache, options } of this.#caches.values()) {
      if (options.onInvalidate) {
        options.onInvalidate(cache, newRouteNames);
      } else {
        cache.clear();
      }
    }
  }

  clear(): void {
    for (const { cache } of this.#caches.values()) {
      cache.clear();
    }
  }

  dispose(): void {
    for (const { cache } of this.#caches.values()) {
      cache.clear();
    }

    this.#caches.clear();
  }

  getMetrics(): Record<string, CacheMetrics> {
    const result: Record<string, CacheMetrics> = {};

    for (const [name, { cache }] of this.#caches) {
      result[name] = cache.getMetrics();
    }

    return result;
  }

  getCacheNames(): string[] {
    return [...this.#caches.keys()];
  }
}

export const cacheManager = new CacheManager();
