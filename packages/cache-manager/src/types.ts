export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export interface CacheInstance<T> {
  get: (key: string, compute: () => T) => T;
  invalidateMatching: (predicate: (key: string) => boolean) => void;
  getMetrics: () => CacheMetrics;
  clear: () => void;
}

export interface CacheOptions<T> {
  maxSize: number;
  onInvalidate?: (cache: CacheInstance<T>, newRouteNames: string[]) => void;
}
