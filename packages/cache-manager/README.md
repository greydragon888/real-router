# @real-router/cache-manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Centralized cache registry with LRU eviction for Real-Router. Provides a generic cache primitive and a dynamic registry for coordinated invalidation and metrics.

## Installation

```bash
npm install @real-router/cache-manager
# or
pnpm add @real-router/cache-manager
# or
yarn add @real-router/cache-manager
# or
bun add @real-router/cache-manager
```

## Quick Start

```typescript
import { cacheManager } from "@real-router/cache-manager";

// Register a named cache
const pathCache = cacheManager.register<string[]>("path", {
  maxSize: 500,
  onInvalidate: (cache, newRouteNames) => {
    cache.invalidateMatching((key) =>
      newRouteNames.some((name) => key.includes(name)),
    );
  },
});

// Use: get cached value or compute on miss
const segments = pathCache.get("users.profile", () =>
  computeExpensivePath("users.profile"),
);

// Metrics
const metrics = cacheManager.getMetrics();
// { path: { hits: 89, misses: 11, hitRate: 0.89, size: 45, maxSize: 500 } }
```

---

## API

### `KeyIndexCache<T>`

Generic LRU cache using `Map<string, T>` with insertion-order eviction.

#### `constructor(maxSize: number)`

Creates a cache with the given capacity.\
`maxSize: number` — positive integer, maximum number of entries

```typescript
import { KeyIndexCache } from "@real-router/cache-manager";

const cache = new KeyIndexCache<number>(100);
```

#### `cache.get(key: string, compute: () => T): T`

Returns cached value or computes and stores it.\
`key: string` — cache key\
`compute: () => T` — factory called on cache miss

On hit: refreshes LRU position. On miss: calls `compute()`, evicts oldest entry if full.

```typescript
const value = cache.get("users.list", () => expensiveComputation());
```

#### `cache.invalidateMatching(predicate: (key: string) => boolean): void`

Removes all entries whose key matches the predicate.\
`predicate: (key: string) => boolean` — filter function

```typescript
cache.invalidateMatching((key) => key.startsWith("users."));
```

#### `cache.getMetrics(): CacheMetrics`

Returns hit/miss statistics and current cache utilization.

```typescript
const { hits, misses, hitRate, size, maxSize } = cache.getMetrics();
```

#### `cache.clear(): void`

Removes all entries and resets statistics.

---

### `CacheManager`

Dynamic registry of `KeyIndexCache` instances with coordinated invalidation.

#### `cacheManager.register<T>(name: string, options: CacheOptions<T>): KeyIndexCache<T>`

Creates and registers a named cache. Throws if name is already registered.\
`name: string` — unique cache identifier\
`options: CacheOptions<T>` — cache configuration

```typescript
const cache = cacheManager.register<NodeState>("nodeState", {
  maxSize: 300,
  onInvalidate: (cache) => cache.clear(),
});
```

#### `cacheManager.unregister(name: string): void`

Removes a named cache from the registry and clears its contents. No-op if not registered.

#### `cacheManager.invalidateForNewRoutes(newRouteNames: string[]): void`

Notifies all registered caches that new routes were added. Caches with `onInvalidate` receive targeted invalidation; caches without it are fully cleared.

```typescript
cacheManager.invalidateForNewRoutes(["users.profile", "users.settings"]);
```

#### `cacheManager.clear(): void`

Clears all cache contents but keeps registrations intact. Use for test setup or SSR per-request reset.

#### `cacheManager.dispose(): void`

Clears all contents and removes all registrations. Idempotent.

#### `cacheManager.getMetrics(): Record<string, CacheMetrics>`

Returns aggregated metrics for all registered caches.

#### `cacheManager.getCacheNames(): string[]`

Returns names of all currently registered caches.

---

## Types

```typescript
import type {
  CacheMetrics,
  CacheOptions,
  CacheInstance,
} from "@real-router/cache-manager";

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

interface CacheInstance<T> {
  get: (key: string, compute: () => T) => T;
  invalidateMatching: (predicate: (key: string) => boolean) => void;
  getMetrics: () => CacheMetrics;
  clear: () => void;
}

interface CacheOptions<T> {
  maxSize: number;
  onInvalidate?: (cache: CacheInstance<T>, newRouteNames: string[]) => void;
}
```

---

## Usage Examples

### Plugin Cache

```typescript
import { cacheManager } from "@real-router/cache-manager";

function prefetchPlugin() {
  const cache = cacheManager.register<Promise<unknown>>("prefetch", {
    maxSize: 50,
  });

  return {
    onTransitionSuccess(toState) {
      cache.get(toState.name, () => fetchData(toState));
    },
    teardown() {
      cacheManager.unregister("prefetch");
    },
  };
}
```

### Test Isolation

```typescript
import { cacheManager } from "@real-router/cache-manager";

beforeEach(() => {
  cacheManager.clear();
});
```

### DevTools Integration

```typescript
const metrics = cacheManager.getMetrics();
// {
//   path:      { hits: 142, misses: 23, hitRate: 0.86, size: 23, maxSize: 500 },
//   nodeState: { hits: 89,  misses: 11, hitRate: 0.89, size: 45, maxSize: 300 }
// }
```

---

## Related Packages

- [@real-router/core](https://www.npmjs.com/package/@real-router/core) — Core router
- [@real-router/logger](https://www.npmjs.com/package/@real-router/logger) — Logger (same singleton pattern)

## License

MIT © [Oleg Ivanov](https://github.com/greydragon888)
