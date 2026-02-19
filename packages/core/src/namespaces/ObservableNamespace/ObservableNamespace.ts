// packages/core/src/namespaces/ObservableNamespace/ObservableNamespace.ts

import { logger } from "@real-router/logger";

import { validEventNames } from "./constants";
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

  emitRouterStart(): void {
    this.#emit(events.ROUTER_START);
  }

  emitRouterStop(): void {
    this.#emit(events.ROUTER_STOP);
  }

  emitTransitionStart(toState: State, fromState?: State): void {
    this.#emit(events.TRANSITION_START, toState, fromState);
  }

  emitTransitionSuccess(
    toState: State,
    fromState?: State,
    opts?: NavigationOptions,
  ): void {
    this.#emit(events.TRANSITION_SUCCESS, toState, fromState, opts);
  }

  emitTransitionError(
    toState?: State,
    fromState?: State,
    error?: RouterErrorType,
  ): void {
    this.#emit(events.TRANSITION_ERROR, toState, fromState, error);
  }

  emitTransitionCancel(toState: State, fromState?: State): void {
    this.#emit(events.TRANSITION_CANCEL, toState, fromState);
  }

  /**
   * Removes an event listener.
   * Only called from unsubscribe closures returned by addEventListener().
   */
  removeEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): void {
    this.#callbacks[eventName]?.delete(cb);
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

    if (set.has(cb)) {
      throw new Error(
        `[router.addEventListener] Duplicate listener for "${eventName}"`,
      );
    }

    const { maxListeners, warnListeners } = this.#limits;

    if (warnListeners !== 0 && set.size === warnListeners) {
      logger.warn(
        "router.addEventListener",
        `Event "${eventName}" has ${warnListeners} listeners — possible memory leak`,
      );
    }

    if (maxListeners !== 0 && set.size >= maxListeners) {
      throw new Error(
        `[router.addEventListener] Listener limit (${maxListeners}) reached for "${eventName}"`,
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

  #emit(eventName: (typeof events)[EventsKeys], ...args: unknown[]): void {
    const set = this.#callbacks[eventName];

    if (!set || set.size === 0) {
      return;
    }

    this.#checkRecursionDepth(eventName);

    const depthMap = this.#getEventDepthMap();

    try {
      depthMap[eventName]++;

      const listeners = [...set];

      for (const cb of listeners) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          Function.prototype.apply.call(cb as Function, undefined, args);
        } catch (error) {
          logger.error("Router", `Error in listener for ${eventName}:`, error);
        }
      }
    } finally {
      depthMap[eventName]--;
    }
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
