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
 * inside an SSR data loader. Mirror of `@real-router/react/ssr` `useDeferred`
 * — same `state.context.ssrDataDeferred` contract, same NEVER-on-missing
 * fallback. Pair with `<Await>` (this package) which adds Preact-side
 * promise-status tracking since Preact 10 has no `use(promise)` analogue.
 */
export function useDeferred<T = unknown>(key: string): Promise<T> {
  const { route } = useRoute();
  const context = route.context as DeferredContext;
  const deferred = context.ssrDataDeferred;
  const promise = deferred?.[key];

  return (promise ?? NEVER_PROMISE) as Promise<T>;
}
