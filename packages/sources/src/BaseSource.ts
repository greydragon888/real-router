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

    if (this.#listeners.size === 0 && this.#onFirstSubscribe) {
      this.#onFirstSubscribe();
    }

    this.#listeners.add(listener);

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
