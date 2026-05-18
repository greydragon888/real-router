import { useEffect, useState } from "preact/hooks";

/**
 * Polyfill for React's useSyncExternalStore.
 *
 * Preact does not provide a native useSyncExternalStore.
 * This implementation uses useState + useEffect to subscribe
 * to external stores.
 *
 * Race condition handling: the value may change between
 * `useState(getSnapshot)` (render) and `useEffect` (commit).
 * We synchronize by calling `setValue(getSnapshot())` before
 * subscribing in the effect.
 *
 * The updater uses `Object.is` to bail out when the snapshot
 * is referentially stable, preventing redundant re-renders.
 *
 * SSR semantics: `_getServerSnapshot` is intentionally ignored.
 * Preact's `preact-render-to-string` runs `useState(getSnapshot)`
 * on the server and does not commit effects, so the initial
 * render already uses `getSnapshot()`. Real-Router's `createRouteSource`
 * (and friends) return the same value on server and client given the
 * same `router` instance, so passing `getSnapshot` itself as the third
 * argument at every call site is the symmetric SSR contract; a separate
 * `getServerSnapshot` would diverge during hydration. Consumers that
 * truly need a different server value should branch in `getSnapshot`.
 *
 * Stable-reference contract: `subscribe` and `getSnapshot` are deps of
 * the subscription effect. If a consumer passes inline closures, every
 * render triggers `unsubscribe → subscribe` plus a fresh `sync()` pass
 * — a silent O(N) reconnect that the Preact polyfill cannot bail out
 * of (React's native impl uses an internal sub-store keyed by identity;
 * we cannot replicate that without losing the latest-snapshot guarantee).
 * All Real-Router hooks pass router-keyed cached factories from
 * `@real-router/sources`, which produce stable refs per `(router, args…)`
 * — keep that pattern for every external use.
 */
export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  _getServerSnapshot?: () => T,
): T {
  const [value, setValue] = useState(getSnapshot);

  useEffect(() => {
    const sync = (): void => {
      setValue((prev) => {
        const next = getSnapshot();

        return Object.is(prev, next) ? prev : next;
      });
    };

    sync();

    return subscribe(sync);
  }, [subscribe, getSnapshot]);

  return value;
}
