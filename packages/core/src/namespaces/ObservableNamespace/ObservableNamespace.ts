// packages/core/src/namespaces/ObservableNamespace/ObservableNamespace.ts

import { logger } from "@real-router/logger";

import { validEventNames } from "./constants";
import { invokeFor } from "./helpers";
import { DEFAULT_LIMITS, events } from "../../constants";

import type { EventMethodMap } from "./types";
import type { Limits } from "../../types";
import type {
  EventName,
  EventsKeys,
  NavigationOptions,
  Plugin,
  RouterError as RouterErrorType,
  State,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";

/**
 * Independent namespace for managing router observability (events).
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle listener storage and invocation.
 */
export class ObservableNamespace {
  readonly #callbacks: {
    [E in EventName]?: Set<Plugin[EventMethodMap[E]]>;
  } = {};

  #eventDepthMap: Record<EventName, number> | null = null;

  #limits: Limits = DEFAULT_LIMITS;

  // =========================================================================
  // Static validation methods (called by facade before instance methods)
  // =========================================================================

  /**
   * Validates that event name is valid.
   */
  static validateEventName(eventName: unknown): asserts eventName is EventName {
    if (!validEventNames.has(eventName as EventName)) {
      throw new Error(`Invalid event name: ${String(eventName)}`);
    }
  }

  /**
   * Validates callback is a function.
   */
  static validateCallback(
    cb: unknown,
    eventName: EventName,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  ): asserts cb is Function {
    if (typeof cb !== "function") {
      throw new TypeError(
        `Expected callback to be a function for event ${eventName}`,
      );
    }
  }

  /**
   * Validates listener arguments (event name + callback).
   * Called by facade before addEventListener/removeEventListener.
   */
  static validateListenerArgs<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): void {
    ObservableNamespace.validateEventName(eventName);
    ObservableNamespace.validateCallback(cb, eventName);
  }

  /**
   * Validates subscribe listener is a function.
   */
  static validateSubscribeListener(
    listener: unknown,
  ): asserts listener is SubscribeFn {
    if (typeof listener !== "function") {
      throw new TypeError(
        "[router.subscribe] Expected a function. " +
          "For Observable pattern use @real-router/rx package",
      );
    }
  }

  setLimits(limits: Limits): void {
    this.#limits = limits;
  }

  clearAll(): void {
    for (const key of Object.keys(this.#callbacks)) {
      this.#callbacks[key as EventName]?.clear();
    }

    this.#eventDepthMap = null;
  }

  // =========================================================================
  // Instance methods (trust input - already validated by facade)
  // =========================================================================

  /**
   * Central event dispatcher.
   * Input should be validated by facade before calling.
   */
  invoke(
    eventName: (typeof events)[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterErrorType | NavigationOptions,
  ): void {
    // Check recursion depth (business logic, not input validation)
    this.#checkRecursionDepth(eventName);

    const depthMap = this.#getEventDepthMap();

    try {
      depthMap[eventName]++;

      switch (eventName) {
        case events.TRANSITION_START:
        case events.TRANSITION_CANCEL: {
          invokeFor(
            eventName,
            this.#getCallbackSet(eventName),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- validated by facade
            toState!,
            fromState,
          );

          break;
        }
        case events.TRANSITION_ERROR: {
          invokeFor(
            eventName,
            this.#getCallbackSet(eventName),
            toState,
            fromState,
            arg as RouterErrorType,
          );

          break;
        }
        case events.TRANSITION_SUCCESS: {
          invokeFor(
            eventName,
            this.#getCallbackSet(eventName),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- validated by facade
            toState!,
            fromState,
            arg as NavigationOptions,
          );

          break;
        }
        // for events.ROUTER_START, events.ROUTER_STOP
        default: {
          const _exhaustiveCheck:
            | typeof events.ROUTER_START
            | typeof events.ROUTER_STOP = eventName;

          invokeFor(_exhaustiveCheck, this.#getCallbackSet(_exhaustiveCheck));

          break;
        }
      }
    } finally {
      depthMap[eventName]--;
    }
  }

  hasListeners(eventName: (typeof events)[EventsKeys]): boolean {
    const set = this.#callbacks[eventName];

    return set !== undefined && set.size > 0;
  }

  /**
   * Removes an event listener.
   * Input should be validated by facade before calling.
   */
  removeEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): void {
    // Don't create Set just for removal - check if it exists first
    const set = this.#callbacks[eventName];

    if (!set || set.size === 0) {
      return;
    }

    const deleted = set.delete(cb);

    if (!deleted) {
      logger.warn(
        "Router",
        `Attempted to remove non-existent listener for "${eventName}". ` +
          `This might indicate a memory leak or incorrect cleanup logic.`,
      );
    }
  }

  /**
   * Adds an event listener and returns an unsubscribe function.
   * Input should be validated by facade before calling.
   */
  addEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    const set = this.#getCallbackSet(eventName);

    // Duplicate check (business logic)
    if (set.has(cb)) {
      throw new Error(
        `[router.addEventListener] Listener already exists for event "${eventName}". ` +
          `Each listener function can only be registered once per event. ` +
          `Store the returned unsubscribe function to remove the listener.`,
      );
    }

    const maxListeners = this.#limits.maxListeners;

    if (set.size === 1000) {
      logger.warn(
        "router.addEventListener",
        `Warning: Event "${eventName}" has ${set.size} listeners. ` +
          `This might indicate a memory leak.`,
      );
    }

    if (maxListeners !== 0 && set.size >= maxListeners) {
      throw new Error(
        `[router.addEventListener] Maximum listener limit (${maxListeners}) ` +
          `reached for event "${eventName}". ` +
          `This is a critical memory leak. The application is creating listeners ` +
          `exponentially. Check for loops or recursive calls that register listeners.`,
      );
    }

    set.add(cb);

    return () => {
      this.removeEventListener(eventName, cb);
    };
  }

  /**
   * Simple subscription API for navigation success events.
   * Input should be validated by facade before calling.
   */
  subscribe(listener: SubscribeFn): Unsubscribe {
    return this.addEventListener(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        listener({
          route: toState,
          previousRoute: fromState,
        });
      },
    );
  }

  // =========================================================================
  // Private methods (business logic)
  // =========================================================================

  /**
   * Gets or creates a Set for the given event name (lazy initialization)
   */
  #getCallbackSet<E extends EventName>(
    eventName: E,
  ): Set<Plugin[EventMethodMap[E]]> {
    const existing = this.#callbacks[eventName];

    if (existing) {
      return existing;
    }

    const set = new Set<Plugin[EventMethodMap[E]]>();

    // Type assertion needed: TS can't narrow generic E to specific event name
    (this.#callbacks as Record<E, Set<Plugin[EventMethodMap[E]]>>)[eventName] =
      set;

    return set;
  }

  /**
   * Gets or creates the event depth map (lazy initialization)
   */
  #getEventDepthMap(): Record<EventName, number> {
    this.#eventDepthMap ??= {
      [events.ROUTER_START]: 0,
      [events.TRANSITION_START]: 0,
      [events.TRANSITION_SUCCESS]: 0,
      [events.TRANSITION_ERROR]: 0,
      [events.TRANSITION_CANCEL]: 0,
      [events.ROUTER_STOP]: 0,
    };

    return this.#eventDepthMap;
  }

  #checkRecursionDepth(eventName: (typeof events)[EventsKeys]): void {
    const maxEventDepth = this.#limits.maxEventDepth;

    if (maxEventDepth === 0) {
      return;
    }

    const depthMap = this.#getEventDepthMap();
    const depth = depthMap[eventName];

    /* v8 ignore next 5 -- @preserve defensive: protects against recursive plugins */
    if (depth >= maxEventDepth) {
      throw new Error(
        `[Router] Maximum recursion depth (${maxEventDepth}) exceeded for event: ${eventName}`,
      );
    }
  }
}
