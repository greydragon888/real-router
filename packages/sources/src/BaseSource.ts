const NOOP_UNSUBSCRIBE: () => void = () => {};

export class BaseSource<T> {
  #currentSnapshot: T;
  #destroyed = false;

  readonly #listeners = new Set<() => void>();

  constructor(initialSnapshot: T) {
    this.#currentSnapshot = initialSnapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.#destroyed) {
      return NOOP_UNSUBSCRIBE;
    }

    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  getSnapshot(): T {
    return this.#currentSnapshot;
  }

  updateSnapshot(snapshot: T): void {
    /* v8 ignore next 2 -- @preserve: defensive guard unreachable via public API (destroy() removes router subscription first) */
    if (this.#destroyed) {
      return;
    }

    this.#currentSnapshot = snapshot;
    this.#listeners.forEach((listener) => {
      listener();
    });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#listeners.clear();
  }
}
