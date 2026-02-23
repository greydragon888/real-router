import type { CacheInstance, CacheMetrics } from "./types.js";

export class KeyIndexCache<T> implements CacheInstance<T> {
  #dict = new Map<string, number>();
  #cache = new Map<number, T>();
  #reverseDict = new Map<number, string>();
  #stats: { hits: number; misses: number } = { hits: 0, misses: 0 };
  #maxSize: number;
  #nextId = 0;

  constructor(maxSize: number) {
    if (maxSize <= 0 || !Number.isInteger(maxSize)) {
      throw new Error(
        `KeyIndexCache: maxSize must be a positive integer, got ${maxSize}`,
      );
    }

    this.#maxSize = maxSize;
  }

  get(key: string, compute: () => T): T {
    const id = this.#dict.get(key);

    if (id !== undefined) {
      this.#stats.hits++;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const value = this.#cache.get(id)!;

      this.#cache.delete(id);
      this.#cache.set(id, value);

      return value;
    }

    this.#stats.misses++;
    const value = compute();

    this.#store(key, value);

    return value;
  }

  invalidateMatching(predicate: (key: string) => boolean): void {
    for (const [key, id] of this.#dict) {
      if (predicate(key)) {
        this.#cache.delete(id);
        this.#reverseDict.delete(id);
        this.#dict.delete(key);
      }
    }
  }

  getMetrics(): CacheMetrics {
    const total = this.#stats.hits + this.#stats.misses;

    return {
      hits: this.#stats.hits,
      misses: this.#stats.misses,
      hitRate: total > 0 ? this.#stats.hits / total : 0,
      size: this.#cache.size,
      maxSize: this.#maxSize,
    };
  }

  clear(): void {
    this.#cache.clear();
    this.#dict.clear();
    this.#reverseDict.clear();
    this.#stats = { hits: 0, misses: 0 };
    this.#nextId = 0;
  }

  #store(key: string, value: T): void {
    if (this.#cache.size >= this.#maxSize) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lruId = this.#cache.keys().next().value!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lruKey = this.#reverseDict.get(lruId)!;

      this.#cache.delete(lruId);
      this.#dict.delete(lruKey);
      this.#reverseDict.delete(lruId);
    }

    const id = this.#nextId++;

    this.#dict.set(key, id);
    this.#cache.set(id, value);
    this.#reverseDict.set(id, key);
  }
}
