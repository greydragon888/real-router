import type {
  EventEmitterLimits,
  EventEmitterOptions,
  Unsubscribe,
} from "./types";

const DEFAULT_LIMITS: EventEmitterLimits = {
  maxListeners: 0,
  warnListeners: 0,
  maxEventDepth: 0,
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type AnyCallback = Function;

/**
 * Sentinel error for recursion depth violations.
 * Re-thrown from the per-listener catch so it propagates to the caller.
 */
export class RecursionDepthError extends Error {
  constructor(message?: string) {
    super(message);
    // Without this, `error.name` inherits "Error" (subclasses don't auto-set
    // it), breaking `error.name === "RecursionDepthError"` checks at catch sites
    // that can't `instanceof` across bundle boundaries.
    this.name = "RecursionDepthError";
  }
}

/**
 * Generic typed event emitter with listener limits, duplicate detection,
 * recursion depth protection, and per-listener error isolation.
 *
 * All features are opt-in via constructor options and limits.
 */
export class EventEmitter<TEventMap extends Record<string, unknown[]>> {
  readonly #callbacks = new Map<string, Set<AnyCallback>>();
  #depthMap: Map<string, number> | null = null;
  #warnedEvents: Set<string> | null = null;
  #limits: EventEmitterLimits = DEFAULT_LIMITS;
  readonly #onListenerError:
    | ((eventName: string, error: unknown) => void)
    | null;
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
   */
  on<E extends keyof TEventMap & string>(
    eventName: E,
    cb: (...args: TEventMap[E]) => void,
  ): Unsubscribe {
    const set = this.#getCallbackSet(eventName);

    if (set.has(cb)) {
      throw new Error(`Duplicate listener for "${eventName}"`);
    }

    const { maxListeners, warnListeners } = this.#limits;

    // Enforce the hard limit before warning, so onListenerWarn never fires for
    // a registration that then throws (the warnListeners === maxListeners case).
    if (maxListeners !== 0 && set.size >= maxListeners) {
      throw new Error(
        `Listener limit (${maxListeners}) reached for "${eventName}"`,
      );
    }

    // Warn at most once per emitter+event. `set.size === warnListeners` can be
    // re-met by off/on churn around the threshold; the latch keeps the advisory
    // hint "exactly once" rather than re-firing on every re-crossing. Reset by
    // clearAll().
    if (
      warnListeners !== 0 &&
      set.size === warnListeners &&
      this.#onListenerWarn !== null
    ) {
      this.#warnedEvents ??= new Set();

      if (!this.#warnedEvents.has(eventName)) {
        this.#warnedEvents.add(eventName);
        this.#onListenerWarn(eventName, warnListeners);
      }
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
   * Uses snapshot iteration — listeners added/removed during emit don't affect
   * the current invocation. Per-listener errors are caught and reported via
   * the onListenerError callback. RecursionDepthError is re-thrown.
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

    // arguments.length is O(1) in V8 strict mode — no deopt
    const argc = arguments.length - 1;

    if (this.#limits.maxEventDepth === 0) {
      this.#emitFast(set, eventName, argc, arg1, arg2, arg3, arg4);

      return;
    }

    this.#emitWithDepthTracking(set, eventName, argc, arg1, arg2, arg3, arg4);
  }

  /**
   * Removes all listeners and resets the depth map.
   */
  clearAll(): void {
    this.#callbacks.clear();
    this.#depthMap = null;
    this.#warnedEvents = null;
  }

  /**
   * Returns the number of listeners for the given event.
   */
  listenerCount(eventName: keyof TEventMap & string): number {
    return this.#callbacks.get(eventName)?.size ?? 0;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Fast emit path — no depth tracking, no try/finally overhead.
   * Used when maxEventDepth === 0 (depth protection disabled).
   */
  #emitFast(
    set: Set<AnyCallback>,
    eventName: string,
    argc: number,
    arg1: unknown,
    arg2: unknown,
    arg3: unknown,
    arg4: unknown,
  ): void {
    // Stryker disable next-line BlockStatement: equivalent — emptying the single-listener fast path falls through to the `[...set]` fallback below, which calls the lone listener identically (proven by injection: forcing the fallback leaves the suite green). The fast path is a perf shortcut only; the `→true`/`→false` ConditionalExpression variants on this line ARE killed by the multi-listener tests.
    if (set.size === 1) {
      const [cb] = set;

      try {
        this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
      } catch (error) {
        this.#handleListenerError(eventName, error);
      }

      return;
    }

    const listeners = [...set];

    for (const cb of listeners) {
      try {
        this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
      } catch (error) {
        this.#handleListenerError(eventName, error);
      }
    }
  }

  /**
   * Calls a listener with the correct number of arguments.
   * Dispatches by argc to preserve exact call semantics.
   */
  #callListener(
    cb: AnyCallback,
    argc: number,
    arg1: unknown,
    arg2: unknown,
    arg3: unknown,
    arg4: unknown,
  ): void {
    switch (argc) {
      case 0: {
        (cb as () => void)();

        break;
      }
      case 1: {
        (cb as (a: unknown) => void)(arg1);

        break;
      }
      case 2: {
        (cb as (a: unknown, b: unknown) => void)(arg1, arg2);

        break;
      }
      case 3: {
        (cb as (a: unknown, b: unknown, c: unknown) => void)(arg1, arg2, arg3);

        break;
      }
      default: {
        (cb as (a: unknown, b: unknown, c: unknown, d: unknown) => void)(
          arg1,
          arg2,
          arg3,
          arg4,
        );
      }
    }
  }

  /**
   * Routes a listener error to onListenerError — except RecursionDepthError,
   * which is a sentinel that must ALWAYS propagate to the caller: it aborts a
   * runaway recursion and must never be absorbed by per-listener isolation.
   * Shared by both emit paths (fast + depth-tracking) so the "always re-thrown"
   * contract cannot diverge between them.
   */
  #handleListenerError(eventName: string, error: unknown): void {
    if (error instanceof RecursionDepthError) {
      throw error;
    }

    this.#onListenerError?.(eventName, error);
  }

  /**
   * Emit path with recursion depth tracking and protection.
   * Used when maxEventDepth > 0.
   */
  #emitWithDepthTracking(
    set: Set<AnyCallback>,
    eventName: string,
    argc: number,
    arg1: unknown,
    arg2: unknown,
    arg3: unknown,
    arg4: unknown,
  ): void {
    this.#depthMap ??= new Map();
    const depthMap = this.#depthMap;
    const depth = depthMap.get(eventName) ?? 0;

    if (depth >= this.#limits.maxEventDepth) {
      throw new RecursionDepthError(
        `Maximum recursion depth (${this.#limits.maxEventDepth}) exceeded for event: ${eventName}`,
      );
    }

    try {
      depthMap.set(eventName, depth + 1);

      // Single-listener fast path — mirrors #emitFast: skip the [...set]
      // snapshot allocation for one listener. The router runs on this path
      // (maxEventDepth = 5), so single-subscriber events hit it on every emit
      // (measured ~10% faster for 1 listener; see audit 2026-06-20 §2.1).
      if (set.size === 1) {
        const [cb] = set;

        try {
          this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
        } catch (error) {
          this.#handleListenerError(eventName, error);
        }
      } else {
        const listeners = [...set];

        for (const cb of listeners) {
          try {
            this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
          } catch (error) {
            this.#handleListenerError(eventName, error);
          }
        }
      }
    } finally {
      // Safe: depthMap.set() at try start guarantees the value exists
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const remaining = depthMap.get(eventName)! - 1;

      // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — delete-at-0 is depthMap heap-hygiene only (#750). A later emit reads `depthMap.get(name) ?? 0`, so an absent entry and a retained `{name → 0}` are indistinguishable: no functional test can observe the delete-vs-set choice. The dynamic-name heap leak from never deleting is guarded by tests/stress S2 (invisible to Stryker).
      if (remaining === 0) {
        // Outermost frame — release the entry so dynamic event names don't
        // accumulate {name → 0} records unbounded. See #750.
        depthMap.delete(eventName);
      } else {
        depthMap.set(eventName, remaining);
      }
    }
  }

  /**
   * Gets or creates a Set for the given event name (lazy initialization).
   */
  #getCallbackSet(eventName: string): Set<AnyCallback> {
    const existing = this.#callbacks.get(eventName);

    if (existing) {
      return existing;
    }

    const set = new Set<AnyCallback>();

    this.#callbacks.set(eventName, set);

    return set;
  }
}
