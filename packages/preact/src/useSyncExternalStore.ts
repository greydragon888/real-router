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
 */
export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  _getServerSnapshot?: () => T,
): T {
  const [value, setValue] = useState(getSnapshot);

  useEffect(() => {
    // Synchronize before subscribing to handle race condition
    setValue(getSnapshot());

    return subscribe(() => {
      setValue(getSnapshot());
    });
  }, [subscribe, getSnapshot]);

  return value;
}
