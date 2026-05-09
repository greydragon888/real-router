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
 * inside an SSR data loader. Returns the Promise for use inside `async setup()`
 * (Vue's native Suspense pattern) or paired with `<Await name="key">`.
 *
 * ```ts
 * // Vue async setup pattern
 * export default defineComponent({
 *   async setup() {
 *     const reviews = await useDeferred<Review[]>("reviews");
 *     return () => h("div", reviews.map(...));
 *   },
 * });
 * ```
 *
 * Returns a forever-pending promise when the key is missing — surfaces
 * loader/consumer key drift as a visible Suspense fallback rather than a
 * silent runtime error.
 */
export function useDeferred<T = unknown>(key: string): Promise<T> {
  const { route } = useRoute();
  const context = route.value.context as DeferredContext;
  const deferred = context.ssrDataDeferred;

  return (deferred?.[key] ?? NEVER_PROMISE) as Promise<T>;
}
