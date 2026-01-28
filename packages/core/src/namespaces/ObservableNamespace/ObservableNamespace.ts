// packages/core/src/namespaces/ObservableNamespace/ObservableNamespace.ts

import { logger } from "@real-router/logger";
import { isNavigationOptions, isState } from "type-guards";

import {
  MAX_EVENT_DEPTH,
  MAX_LISTENERS_HARD_LIMIT,
  validEventNames,
} from "./constants";
import { invokeFor } from "./helpers";
import { events } from "../../constants";
import { RouterError } from "../../RouterError";

import type {
  EventMethodMap,
  Observer,
  ObservableOptions,
  RouterObservable,
  SubscribeState,
  Subscription,
} from "./types";
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

// ============================================================================
// Symbol.observable support (TC39 proposal)
// ============================================================================

/**
 * Symbol.observable polyfill declaration for TC39 proposal
 *
 * @see https://github.com/tc39/proposal-observable
 */
declare global {
  interface SymbolConstructor {
    readonly observable: unique symbol;
  }
}

/**
 * Observable symbol - TC39 proposal with fallback
 */
const $$observable: typeof Symbol.observable =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for environments without Symbol.observable
  (typeof Symbol === "function" && Symbol.observable) ||
  ("@@observable" as unknown as typeof Symbol.observable);

/**
 * Independent namespace for managing router observability (events).
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle listener storage and invocation.
 */
export class ObservableNamespace {
  /**
   * Event listeners storage. Using Set for O(1) operations and automatic deduplication.
   * Sets are created lazily to reduce memory footprint when events are not used.
   */
  readonly #callbacks: {
    [E in EventName]?: Set<Plugin[EventMethodMap[E]]>;
  } = {};

  /**
   * Tracks current recursion depth for each event type.
   * Created lazily to reduce memory footprint when events are not dispatched.
   */
  #eventDepthMap: Record<EventName, number> | null = null;

  /**
   * Track active observers for deduplication
   * Using WeakMap to allow garbage collection of observers
   */
  readonly #observerSubscriptions = new WeakMap<
    Observer,
    { unsubscribe: Unsubscribe; active: boolean }
  >();

  /**
   * Functional reference to get current state (set via setGetState)
   */
  #getState: (() => State | undefined) | null = null;

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
          "For Observable pattern use router[Symbol.observable]().subscribe(observer)",
      );
    }
  }

  /**
   * Validates invoke arguments based on event type.
   * Called by facade before invoke.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  static validateInvokeArgs(
    eventName: (typeof events)[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterErrorType | NavigationOptions,
  ): void {
    ObservableNamespace.validateEventName(eventName);

    switch (eventName) {
      case events.TRANSITION_START:
      case events.TRANSITION_CANCEL: {
        if (!toState) {
          throw new TypeError(
            `[router.invokeEventListeners] toState is required for event "${eventName}"`,
          );
        }

        if (!isState(toState)) {
          throw new TypeError(
            `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        if (fromState && !isState(fromState)) {
          throw new TypeError(
            `[router.invokeEventListeners] fromState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        break;
      }
      case events.TRANSITION_ERROR: {
        if (toState && !isState(toState)) {
          throw new TypeError(
            `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        if (fromState && !isState(fromState)) {
          throw new TypeError(
            `[router.invokeEventListeners] fromState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        if (!arg) {
          throw new TypeError(
            `[router.invokeEventListeners] error is required for event "${eventName}"`,
          );
        }

        if (!(arg instanceof RouterError)) {
          throw new TypeError(
            `[router.invokeEventListeners] error must be a RouterError instance for event "${eventName}". ` +
              `Got: ${typeof arg === "object" ? arg.constructor.name : typeof arg}`,
          );
        }

        break;
      }
      case events.TRANSITION_SUCCESS: {
        if (!toState) {
          throw new TypeError(
            `[router.invokeEventListeners] toState is required for event "${eventName}"`,
          );
        }

        if (!isState(toState)) {
          throw new TypeError(
            `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        if (fromState && !isState(fromState)) {
          throw new TypeError(
            `[router.invokeEventListeners] fromState is invalid for event "${eventName}". ` +
              `Expected State object with name, path, and params.`,
          );
        }

        if (!arg) {
          throw new TypeError(
            `[router.invokeEventListeners] options is required for event "${eventName}"`,
          );
        }

        if (arg instanceof RouterError) {
          throw new TypeError(
            `[router.invokeEventListeners] options cannot be a RouterError for event "${eventName}". ` +
              `Use TRANSITION_ERROR event for errors.`,
          );
        }

        if (!isNavigationOptions(arg)) {
          throw new TypeError(
            `[router.invokeEventListeners] options is invalid for event "${eventName}". ` +
              `Expected NavigationOptions object.`,
          );
        }

        break;
      }
      // ROUTER_START and ROUTER_STOP have no required args
      default: {
        break;
      }
    }
  }

  // =========================================================================
  // Dependency injection for state access
  // =========================================================================

  /**
   * Sets the function to get current router state.
   * Required for replay feature in observable().
   */
  setGetState(getState: () => State | undefined): void {
    this.#getState = getState;
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

  /**
   * Checks if there are any listeners registered for a given event.
   */
  hasListeners(eventName: (typeof events)[EventsKeys]): boolean {
    if (!validEventNames.has(eventName)) {
      return false;
    }

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

    // Limit warnings (business logic)
    if (set.size === 1000) {
      logger.warn(
        "router.addEventListener",
        `Warning: Event "${eventName}" has ${set.size} listeners. ` +
          `This might indicate a memory leak.`,
      );
    }

    // Hard limit (business logic)
    if (set.size >= MAX_LISTENERS_HARD_LIMIT) {
      throw new Error(
        `[router.addEventListener] Maximum listener limit (${MAX_LISTENERS_HARD_LIMIT}) ` +
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

  /**
   * Returns a TC39-compliant Observable for router state changes.
   * Supports deduplication, error isolation, replay, and AbortSignal.
   */
  observable(): RouterObservable {
    const observableObj: RouterObservable = {
      /**
       * TC39 Observable spec: [Symbol.observable]() returns self
       * Note: In Node.js where Symbol.observable is undefined, $$observable falls
       * back to "@@observable" string, and this method gets overwritten by line below.
       */
      /* v8 ignore next 3 -- @preserve unreachable in Node.js: $$observable = "@@observable" when Symbol.observable is undefined */
      [$$observable]() {
        return observableObj;
      },

      /**
       * Subscribe to router state changes - uses arrow function to bind `this`
       */
      subscribe: this.#subscribeImpl.bind(this),
    };

    // Add @@observable string key for RxJS compatibility
    (observableObj as unknown as Record<string, unknown>)["@@observable"] =
      () => observableObj;

    return observableObj;
  }

  /**
   * Internal implementation of observable subscribe
   */
  #subscribeImpl(
    observer: Observer | ((value: SubscribeState) => void),
    options: ObservableOptions = {},
  ): Subscription {
    // Normalize observer
    const normalizedObserver: Observer =
      typeof observer === "function" ? { next: observer } : observer;

    // Check for duplicate subscription
    const existing = this.#observerSubscriptions.get(normalizedObserver);

    if (existing?.active) {
      logger.warn(
        "router.observable",
        "Duplicate subscription prevented. Same observer already subscribed.",
      );

      return {
        unsubscribe: existing.unsubscribe,
        get closed() {
          return !existing.active;
        },
      };
    }

    const { signal, replay = true } = options;

    // Check if already aborted
    if (signal?.aborted) {
      return {
        unsubscribe: () => {},
        closed: true,
      };
    }

    let closed = false;

    // Create safe invoker with error isolation
    const safeNext = (value: SubscribeState) => {
      if (closed) {
        return;
      }

      if (normalizedObserver.next) {
        try {
          normalizedObserver.next(value);
        } catch (error) {
          logger.error("router.observable", "Error in observer.next:", error);

          // Call error handler if provided
          if (normalizedObserver.error) {
            try {
              normalizedObserver.error(error);
            } catch (errorHandlerError) {
              logger.error(
                "router.observable",
                "Error in observer.error:",
                errorHandlerError,
              );
            }
          }
        }
      }
    };

    // Subscribe to TRANSITION_SUCCESS events
    const unsubscribeFromEvents = this.addEventListener(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        safeNext({
          route: toState,
          previousRoute: fromState,
        });
      },
    );

    // Create unsubscribe function
    const unsubscribe = () => {
      if (closed) {
        return;
      }

      closed = true;

      // Update tracking (sub always exists - added synchronously in subscribe before unsubscribe returned)
      const sub = this.#observerSubscriptions.get(normalizedObserver);

      /* v8 ignore next 3 -- @preserve unreachable: sub added synchronously before unsubscribe is returned */
      if (sub) {
        sub.active = false;
      }

      // Remove event listener
      unsubscribeFromEvents();

      // Call complete handler
      if (normalizedObserver.complete) {
        try {
          normalizedObserver.complete();
        } catch (error) {
          logger.error(
            "router.observable",
            "Error in observer.complete:",
            error,
          );
        }
      }
    };

    // Track subscription
    this.#observerSubscriptions.set(normalizedObserver, {
      unsubscribe,
      active: true,
    });

    // Handle AbortSignal
    if (signal) {
      signal.addEventListener("abort", unsubscribe, { once: true });
    }

    // Replay current state if requested
    if (replay && this.#getState) {
      const currentState = this.#getState();

      if (currentState) {
        // Use queueMicrotask to ensure subscription is set up before replay
        queueMicrotask(() => {
          safeNext({
            route: currentState,
            previousRoute: undefined,
          });
        });
      }
    }

    return {
      unsubscribe,
      get closed() {
        return closed;
      },
    };
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

  /**
   * Checks recursion depth for event invocation (business logic).
   */
  #checkRecursionDepth(eventName: (typeof events)[EventsKeys]): void {
    const depthMap = this.#getEventDepthMap();
    const depth = depthMap[eventName];

    if (depth >= MAX_EVENT_DEPTH) {
      throw new Error(
        `[Router] Maximum recursion depth (${MAX_EVENT_DEPTH}) exceeded for event: ${eventName}`,
      );
    }
  }
}
