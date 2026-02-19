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
   */
  emit<E extends keyof TEventMap & string>(
    eventName: E,
    ...args: TEventMap[E]
  ): void {
    const set = this.#callbacks.get(eventName);

    if (!set || set.size === 0) {
      return;
    }

    if (this.#limits.maxEventDepth === 0) {
      this.#emitFast(set, eventName, args);

      return;
    }

    this.#emitWithDepthTracking(set, eventName, args);
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
  #emitFast(set: Set<AnyCallback>, eventName: string, args: unknown[]): void {
    const listeners = [...set];

    for (const cb of listeners) {
      try {
        switch (args.length) {
          case 0: {
            (cb as () => void)();

            break;
          }
          case 1: {
            (cb as (a: unknown) => void)(args[0]);

            break;
          }
          case 2: {
            (cb as (a: unknown, b: unknown) => void)(args[0], args[1]);

            break;
          }
          case 3: {
            (cb as (a: unknown, b: unknown, c: unknown) => void)(
              args[0],
              args[1],
              args[2],
            );

            break;
          }
          default: {
            Function.prototype.apply.call(cb, undefined, args);
          }
        }
      } catch (error) {
        this.#onListenerError?.(eventName, error);
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
    args: unknown[],
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

      const listeners = [...set];

      for (const cb of listeners) {
        try {
          switch (args.length) {
            case 0: {
              (cb as () => void)();

              break;
            }
            case 1: {
              (cb as (a: unknown) => void)(args[0]);

              break;
            }
            case 2: {
              (cb as (a: unknown, b: unknown) => void)(args[0], args[1]);

              break;
            }
            case 3: {
              (cb as (a: unknown, b: unknown, c: unknown) => void)(
                args[0],
                args[1],
                args[2],
              );

              break;
            }
            default: {
              Function.prototype.apply.call(cb, undefined, args);
            }
          }
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
