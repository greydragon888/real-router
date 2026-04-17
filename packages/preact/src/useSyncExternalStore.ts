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
