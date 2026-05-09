import { useRoute } from "./useRoute.svelte";

interface DeferredContext {
  ssrDataDeferred?: Record<string, Promise<unknown>>;
}

const NEVER_PROMISE = new Promise<never>(() => {
  // Intentionally never resolves — surfaces a forever-pending {#await} block
  // when a key is requested that the loader never declared.
});

/**
 * Read a deferred promise published by `defer({ deferred: { <key>: Promise } })`
 * inside an SSR data loader. Returns the Promise — feed straight into Svelte's
 * native `{#await}` block, or use `<Await name="key">` (this package) for the
 * cross-adapter shape.
 *
 * ```svelte
 * <script>
 *   import { useDeferred } from "@real-router/svelte/ssr";
 *   const reviewsPromise = useDeferred("reviews");
 * </script>
 *
 * {#await reviewsPromise}
 *   <Spinner />
 * {:then reviews}
 *   <ReviewList items={reviews} />
 * {/await}
 * ```
 *
 * Returns a forever-pending promise when the key is missing — surfaces
 * loader/consumer key drift as a visible {#await} loading state rather than
 * a silent runtime error.
 */
export function useDeferred<T = unknown>(key: string): Promise<T> {
  const { route } = useRoute();
  const context = route.current.context as DeferredContext;
  const deferred = context.ssrDataDeferred;

  return (deferred?.[key] ?? NEVER_PROMISE) as Promise<T>;
}
