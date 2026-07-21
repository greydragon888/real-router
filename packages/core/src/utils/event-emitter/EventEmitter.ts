import type {
  EventEmitterLimits,
  EventEmitterOptions,
  Unsubscribe,
} from "./types";

const DEFAULT_LIMITS: EventEmitterLimits = {
  maxListeners: 0,
  warnListeners: 0,
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type AnyCallback = Function;

/**
 * Generic typed event emitter with listener limits, duplicate detection,
 * re-entrancy coalescing, and per-listener error isolation.
 *
 * All limits are opt-in via constructor options.
 */
export class EventEmitter<TEventMap extends Record<string, unknown[]>> {
  readonly #callbacks = new Map<string, Set<AnyCallback>>();
  // Names currently being dispatched. A re-entrant `emit` of an event already
  // on this set is coalesced to a no-op (see `emit`), so an event can never
  // re-enter its own dispatch — recursion is structurally impossible (depth ≤ 1)
  // with no depth bound and no stack-overflow path (#1033).
  readonly #dispatching = new Set<string>();
  #warnedEvents: Set<string> | null = null;
  #limits: EventEmitterLimits = DEFAULT_LIMITS;
  readonly #onListenerError:
    ((eventName: string, error: unknown) => void) | null;
  readonly #onListenerWarn: ((eventName: string, count: number) => void) | null;

  constructor(options?: EventEmitterOptions) {
    if (options?.limits) {
      this.#limits = options.limits;
    }

    this.#onListenerError = options?.onListenerError ?? null;
    this.#onListenerWarn = options?.onListenerWarn ?? null;
  }

  /**
   * Validates that a callback is a function.
   */
  static validateCallback(
    cb: unknown,
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  ): asserts cb is Function {
    if (typeof cb !== "function") {
      throw new TypeError(
        `Expected callback to be a function for event ${eventName}`,
      );
    }
  }

  /**
   * Replaces current limits with the provided limits.
   */
  setLimits(limits: EventEmitterLimits): void {
    this.#limits = limits;
  }

  /**
   * Adds an event listener and returns an unsubscribe function.
   * Throws on duplicate listeners or when maxListeners is reached.
   *
   * Registration is atomic (validate-before-mutate, #1358): every rejection
   * check runs against the CURRENT record (read once, never created early), the
   * advisory warn hook runs before any mutation, and the record is created +
   * the listener added only after all checks pass. So a throw — a rejected
   * limit, or a throwing `onListenerWarn` — leaves NO side-effect behind: no
   * orphaned empty record (#1167) and no burnt warn latch (#1168).
   */
  on<E extends keyof TEventMap & string>(
    eventName: E,
    cb: (...args: TEventMap[E]) => void,
  ): Unsubscribe {
    const existing = this.#callbacks.get(eventName);
    const size = existing?.size ?? 0;

    if (existing?.has(cb)) {
      throw new Error(`Duplicate listener for "${eventName}"`);
    }

    const { maxListeners, warnListeners } = this.#limits;

    // Enforce the hard limit before warning, so onListenerWarn never fires for
    // a registration that then throws (the warnListeners === maxListeners case).
    if (maxListeners !== 0 && size >= maxListeners) {
      throw new Error(
        `Listener limit (${maxListeners}) reached for "${eventName}"`,
      );
    }

    // Warn at most once per emitter+event, using the PRE-add size. The hook is
    // invoked first and the latch set only after it returns without throwing, so
    // a throwing hook fails the registration atomically and leaves the latch
    // unspent — the next (W+1)th registration warns as documented (#1168). The
    // latch keeps the advisory hint "exactly once" across off/on churn around
    // the threshold; reset by clearAll() or by removing the last listener.
    if (
      warnListeners !== 0 &&
      size === warnListeners &&
      this.#onListenerWarn !== null
    ) {
      this.#warnedEvents ??= new Set();

      if (!this.#warnedEvents.has(eventName)) {
        this.#onListenerWarn(eventName, warnListeners);
        this.#warnedEvents.add(eventName);
      }
    }

    // Mutate last — create the record only now, so a rejected registration
    // above never strands an empty record (#1167).
    let set = existing;

    if (set === undefined) {
      set = new Set();
      this.#callbacks.set(eventName, set);
    }

    set.add(cb);

    return () => {
      this.off(eventName, cb);
    };
  }

  /**
   * Removes an event listener.
   */
  off<E extends keyof TEventMap & string>(
    eventName: E,
    cb: (...args: TEventMap[E]) => void,
  ): void {
    const set = this.#callbacks.get(eventName);

    if (!set) {
      return;
    }

    set.delete(cb);

    if (set.size === 0) {
      // Release per-event records once the last listener is gone, so consumers
      // with dynamic event names don't accumulate empty Sets unbounded
      // (listenerCount stays 0 either way, masking the growth). See #750.
      this.#callbacks.delete(eventName);
      this.#warnedEvents?.delete(eventName);
    }
  }

  /**
   * Emits an event, calling all registered listeners with the provided args.
   *
   * Uses snapshot iteration — listeners added/removed during emit don't affect
   * the current invocation. Per-listener errors are caught and reported via the
   * `onListenerError` callback; other listeners still run.
   *
   * Re-entrant emit is coalesced: emitting an event that is already being
   * dispatched (a listener that synchronously re-emits the same event) is a
   * no-op, so dispatch never recurses into itself (#1033).
   *
   * Uses explicit params instead of rest params to avoid V8 array materialization.
   * Extra undefined args are harmless — JS functions ignore extra arguments.
   */
  emit(
    eventName: keyof TEventMap & string,
    arg1?: unknown,
    arg2?: unknown,
    arg3?: unknown,
    arg4?: unknown,
  ): void {
    const set = this.#callbacks.get(eventName);

    if (!set || set.size === 0) {
      return;
    }

    // Coalesce a re-entrant emit of an in-flight event (depth ≤ 1, #1033).
    if (this.#dispatching.has(eventName)) {
      return;
    }

    // arguments.length is O(1) in V8 strict mode — no deopt
    const argc = arguments.length - 1;

    this.#dispatching.add(eventName);

    try {
      // Single-listener fast path — skip the [...set] snapshot allocation.
      if (set.size === 1) {
        const [cb] = set;

        this.#invokeIsolated(eventName, cb, argc, arg1, arg2, arg3, arg4);
      } else {
        const listeners = [...set];

        for (const cb of listeners) {
          this.#invokeIsolated(eventName, cb, argc, arg1, arg2, arg3, arg4);
        }
      }
    } finally {
      this.#dispatching.delete(eventName);
    }
  }

  /**
   * Removes all listeners and resets the warn latch.
   *
   * Does NOT touch `#dispatching`: the in-flight coalesce guard is owned by the
   * active `emit` frame (added when dispatch starts, self-released in that
   * frame's `finally`). Clearing it here would lift the guard for a live frame
   * when `clearAll()` runs from inside a listener, so a re-entrant same-event
   * emit would no longer coalesce and would re-enter — violating the depth-≤-1
   * contract (#1164). The guard self-releases; `clearAll()` has no business
   * sweeping state owned by active emit frames.
   */
  clearAll(): void {
    this.#callbacks.clear();
    this.#warnedEvents = null;
  }

  /**
   * Returns the number of listeners for the given event.
   */
  listenerCount(eventName: keyof TEventMap & string): number {
    return this.#callbacks.get(eventName)?.size ?? 0;
  }

  /**
   * Returns whether the given event is currently being dispatched (an `emit`
   * for it is on the stack). Single source of truth for "is this event
   * in-flight" — consumers read it to reject re-entrant operations that would
   * trigger such an emit (the emit itself would be coalesced regardless).
   */
  isDispatching(eventName: keyof TEventMap & string): boolean {
    return this.#dispatching.has(eventName);
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Calls a listener with the correct number of arguments.
   * Dispatches by argc to preserve exact call semantics.
   */
  #invokeIsolated(
    eventName: keyof TEventMap & string,
    cb: AnyCallback,
    argc: number,
    arg1: unknown,
    arg2: unknown,
    arg3: unknown,
    arg4: unknown,
  ): void {
    try {
      const result = this.#callListener(cb, argc, arg1, arg2, arg3, arg4);

      // A listener typed `=> void` may still return a Promise at runtime (an
      // async hook or any-cast misuse). The sync `catch` below cannot see its
      // rejection, so route it to the same `#onListenerError` sink — otherwise
      // it escapes as a Node `unhandledRejection` (fatal under
      // `--unhandled-rejections=strict`, the Node 22+ default). Centralised here
      // so every listener kind (plugin hooks, `subscribe`, …) is isolated
      // symmetrically (#1412; `subscribe`'s per-site #944 wrapper folds in).
      if (
        result !== null &&
        result !== undefined &&
        typeof (result as PromiseLike<unknown>).then === "function"
      ) {
        Promise.resolve(result as PromiseLike<unknown>).catch(
          (error: unknown) => {
            this.#onListenerError?.(eventName, error);
          },
        );
      }
    } catch (error) {
      this.#onListenerError?.(eventName, error);
    }
  }

  #callListener(
    cb: AnyCallback,
    argc: number,
    arg1: unknown,
    arg2: unknown,
    arg3: unknown,
    arg4: unknown,
  ): unknown {
    switch (argc) {
      case 0: {
        return (cb as () => unknown)();
      }
      case 1: {
        return (cb as (a: unknown) => unknown)(arg1);
      }
      case 2: {
        return (cb as (a: unknown, b: unknown) => unknown)(arg1, arg2);
      }
      case 3: {
        return (cb as (a: unknown, b: unknown, c: unknown) => unknown)(
          arg1,
          arg2,
          arg3,
        );
      }
      default: {
        return (
          cb as (a: unknown, b: unknown, c: unknown, d: unknown) => unknown
        )(arg1, arg2, arg3, arg4);
      }
    }
  }

  // (record creation is inlined into `on()` so a rejected registration never
  // creates one — see the atomicity note there, #1167/#1358.)
}
