import { useRoute } from "./useRoute";

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
 * - **Server render**: returns the actual loader-returned promise. Combine
 *   with `<Suspense>` + `use(promise)` for native streaming via React 19's
 *   `renderToReadableStream`.
 * - **Post-hydration**: returns a registry-backed promise; the inline
 *   `<script>__rrDefer__("key", json)</script>` tags emitted by the server
 *   stream resolve it. `use()` returns synchronously once the registry
 *   settles.
 * - **Unknown key**: returns a never-resolving promise — Suspense boundary
 *   stays in fallback. This surfaces consumer/loader key drift as a visible
 *   loading state instead of a silent runtime error.
 *
 * The hook subscribes to `RouteContext`, so it re-runs on every navigation.
 * Promise reference identity is stable across renders within the same
 * navigation — `use()` will not re-suspend on rerenders.
 */
export function useDeferred<T = unknown>(key: string): Promise<T> {
  const { route } = useRoute();
  const context = route.context as DeferredContext;
  const deferred = context.ssrDataDeferred;
  const promise = deferred?.[key];

  return (promise ?? NEVER_PROMISE) as Promise<T>;
}
