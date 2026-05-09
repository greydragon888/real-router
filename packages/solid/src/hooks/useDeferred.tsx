import { useRoute } from "./useRoute";

import type { Accessor } from "solid-js";

interface DeferredContext {
  ssrDataDeferred?: Record<string, Promise<unknown>>;
}

const NEVER_PROMISE = new Promise<never>(() => {
  // Intentionally never resolves — surfaces a forever-pending Suspense boundary
  // when a key is requested that the loader never declared.
});

/**
 * Read a deferred promise published by `defer({ deferred: { <key>: Promise } })`
 * inside an SSR data loader.
 *
 * Returns a Solid `Accessor<Promise<T>>` so the value tracks the active route
 * — re-reading on navigation picks up the new state's deferred map. Wrap with
 * `<Await name="key">{(value) => …}</Await>` (this package), which builds on
 * `createResource` + `<Suspense>` for native Solid streaming.
 *
 * Returns a forever-pending promise when the key is missing — surfaces
 * loader/consumer key drift as a visible Suspense fallback rather than a
 * silent runtime error.
 */
export function useDeferred<T = unknown>(key: string): Accessor<Promise<T>> {
  const routeAccessor = useRoute();

  return () => {
    const context = routeAccessor().route.context as DeferredContext;
    const deferred = context.ssrDataDeferred;

    return (deferred?.[key] ?? NEVER_PROMISE) as Promise<T>;
  };
}
