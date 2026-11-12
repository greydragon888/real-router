export interface BaseSourceOptions<T> {
  /**
   * Recomputes the snapshot from what the source mirrors. A source that passes
   * it is lazy: it is connected only while it has listeners, so between the
   * last unsubscribe and the next subscribe its stored snapshot can lag.
   * `BaseSource` calls it on a read made while the source has no listener and
   * is not destroyed, and for the first listener once `onFirstSubscribe` has
   * connected the source.
   *
   * Returns `current` itself when nothing it depends on changed, so a repeated
   * read returns one reference — the contract `useSyncExternalStore` puts on
   * `getSnapshot`.
   */
  reconcile?: (current: T) => T;
  onFirstSubscribe?: () => void;
  onLastUnsubscribe?: () => void;
  onDestroy?: () => void;
}

export class BaseSource<T> {
  #currentSnapshot: T;
  #destroyed = false;

  readonly #listeners = new Set<() => void>();
  readonly #reconcile: ((current: T) => T) | undefined;
  readonly #onFirstSubscribe: (() => void) | undefined;
  readonly #onLastUnsubscribe: (() => void) | undefined;
  readonly #onDestroy: (() => void) | undefined;

  constructor(initialSnapshot: T, options?: BaseSourceOptions<T>) {
    this.#currentSnapshot = initialSnapshot;
    this.#reconcile = options?.reconcile;
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

    // Add the listener BEFORE onFirstSubscribe and the catch-up, so a snapshot
    // they change reaches it: a subscriber that did not read first is notified
    // of the catch-up.
    this.#listeners.add(listener);

    const unsubscribe = (): void => {
      this.#listeners.delete(listener);

      if (
        !this.#destroyed &&
        this.#listeners.size === 0 &&
        this.#onLastUnsubscribe
      ) {
        this.#onLastUnsubscribe();
      }
    };

    if (wasFirst) {
      try {
        this.#onFirstSubscribe?.();
        this.#catchUp();
      } catch (error) {
        // A first subscribe that throws, in the connect or in the catch-up, is
        // undone as an unsubscribe: the listener goes and so does a connection
        // the connect made, so the source stays disconnected and its reads
        // reconcile.
        unsubscribe();

        throw error;
      }
    }

    return unsubscribe;
  }

  getSnapshot(): T {
    // No listener, no connection: a lazy source answers from what it mirrors,
    // so a render that reads before it subscribes gets the snapshot the
    // subscribe delivers (#2909). A connected source answers from what it was
    // told: a read made during an announcement must not take the change for
    // itself, or the source's own listener finds nothing to tell.
    if (
      this.#reconcile !== undefined &&
      this.#listeners.size === 0 &&
      !this.#destroyed
    ) {
      this.#currentSnapshot = this.#reconcile(this.#currentSnapshot);
    }

    return this.#currentSnapshot;
  }

  updateSnapshot(snapshot: T): void {
    // Core's emitter calls every listener registered when an announcement
    // began, so a source destroyed by an earlier listener of the same
    // announcement still receives it.
    if (this.#destroyed) {
      return;
    }

    this.#currentSnapshot = snapshot;
    // Isolate listener exceptions so a single throwing subscriber (e.g. React
    // error-boundary fallback throwing inside `onStoreChange`) does not block
    // the remaining subscribers — the invariant "after updateSnapshot all
    // listeners see the new snapshot" must hold. Re-throw asynchronously via
    // queueMicrotask so global error handlers / test harnesses still surface
    // the bug without breaking the synchronous notification fan-out.
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.#onDestroy?.();
    this.#listeners.clear();
  }

  // Runs after onFirstSubscribe, so a listener the catch-up notifies acts on a
  // connected source: a navigation, an unsubscribe or a destroy() it makes is
  // seen.
  #catchUp(): void {
    if (this.#reconcile === undefined) {
      return;
    }

    const reconciled = this.#reconcile(this.#currentSnapshot);

    if (!Object.is(reconciled, this.#currentSnapshot)) {
      this.updateSnapshot(reconciled);
    }
  }
}
