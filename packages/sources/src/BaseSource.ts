export interface BaseSourceOptions {
  onFirstSubscribe?: () => void;
  onLastUnsubscribe?: () => void;
  onDestroy?: () => void;
}

export class BaseSource<T> {
  #currentSnapshot: T;
  #destroyed = false;

  readonly #listeners = new Set<() => void>();
  readonly #onFirstSubscribe: (() => void) | undefined;
  readonly #onLastUnsubscribe: (() => void) | undefined;
  readonly #onDestroy: (() => void) | undefined;

  constructor(initialSnapshot: T, options?: BaseSourceOptions) {
    this.#currentSnapshot = initialSnapshot;
    this.#onFirstSubscribe = options?.onFirstSubscribe;
    this.#onLastUnsubscribe = options?.onLastUnsubscribe;
    this.#onDestroy = options?.onDestroy;

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  subscribe(listener: () => void): () => void {
    if (this.#destroyed) {
      return () => {};
    }

    const wasFirst = this.#listeners.size === 0;

    // Add listener BEFORE onFirstSubscribe so that if the reconciliation in
    // onFirstSubscribe calls updateSnapshot(), this listener receives the
    // notification. Critical for useSyncExternalStore in adapters — without
    // this the post-reconnection snapshot is missed and consumers render
    // stale data. (See Preact RouteView nested remount test.)
    this.#listeners.add(listener);

    if (wasFirst && this.#onFirstSubscribe) {
      this.#onFirstSubscribe();
    }

    return () => {
      this.#listeners.delete(listener);

      if (
        !this.#destroyed &&
        this.#listeners.size === 0 &&
        this.#onLastUnsubscribe
      ) {
        this.#onLastUnsubscribe();
      }
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
    this.#onDestroy?.();
    this.#listeners.clear();
  }
}
