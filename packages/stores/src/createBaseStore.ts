interface BaseStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  _update: (snapshot: T) => void;
  destroy: () => void;
}

export function createBaseStore<T>(initialSnapshot: T): BaseStore<T> {
  let currentSnapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  let destroyed = false;

  return {
    subscribe(listener: () => void): () => void {
      if (destroyed) {
        return () => {};
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): T {
      return currentSnapshot;
    },

    _update(snapshot: T): void {
      /* v8 ignore next 2 -- @preserve: defensive guard unreachable via public API (destroy() removes router subscription first) */
      if (destroyed) {
        return;
      }

      currentSnapshot = snapshot;
      listeners.forEach((listener) => {
        listener();
      });
    },

    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;
      listeners.clear();
    },
  };
}
