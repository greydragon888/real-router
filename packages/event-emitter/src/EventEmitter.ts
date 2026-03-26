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
class RecursionDepthError extends Error {}

/**
 * Generic typed event emitter with listener limits, duplicate detection,
 * recursion depth protection, and per-listener error isolation.
 *
 * All features are opt-in via constructor options and limits.
 */
export class EventEmitter<TEventMap extends Record<string, unknown[]>> {
  readonly #callbacks = new Map<string, Set<AnyCallback>>();
  #depthMap: Map<string, number> | null = null;
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

    if (set.has(cb as AnyCallback)) {
      throw new Error(`Duplicate listener for "${eventName}"`);
    }

    const { maxListeners, warnListeners } = this.#limits;

    if (warnListeners !== 0 && set.size === warnListeners) {
      this.#onListenerWarn?.(eventName, warnListeners);
    }

    if (maxListeners !== 0 && set.size >= maxListeners) {
      throw new Error(
        `Listener limit (${maxListeners}) reached for "${eventName}"`,
      );
    }

    set.add(cb as AnyCallback);

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
    this.#callbacks.get(eventName)?.delete(cb as AnyCallback);
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
    if (set.size === 1) {
      const [cb] = set;

      try {
        this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
      } catch (error) {
        this.#onListenerError?.(eventName, error);
      }

      return;
    }

    const listeners = [...set];

    for (const cb of listeners) {
      try {
        this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
      } catch (error) {
        this.#onListenerError?.(eventName, error);
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

      const listeners = set.size === 1 ? set : [...set];

      for (const cb of listeners) {
        try {
          this.#callListener(cb, argc, arg1, arg2, arg3, arg4);
        } catch (error) {
          if (error instanceof RecursionDepthError) {
            throw error;
          }

          this.#onListenerError?.(eventName, error);
        }
      }
    } finally {
      // Safe: depthMap.set() at try start guarantees the value exists
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      depthMap.set(eventName, depthMap.get(eventName)! - 1);
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
