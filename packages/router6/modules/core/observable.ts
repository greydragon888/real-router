// packages/router6/modules/core/observable.ts

import { isNavigationOptions, isState } from "type-guards";

import { events, RouterError } from "router6";

import type { plugins } from "../constants";
import type {
  DefaultDependencies,
  EventName,
  EventsKeys,
  NavigationOptions,
  Plugin,
  Router,
  RouterError as RouterErrorType,
  State,
  SubscribeFn,
  Unsubscribe,
} from "router6-types";

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

type EventMethodMap = {
  [K in EventsKeys as (typeof events)[K]]: (typeof plugins)[K];
};

/**
 * Max recursion depth to prevent stack overflow from circular event triggers
 */
const MAX_EVENT_DEPTH = 5;

/**
 * Hard limit to prevent memory leaks from exponential listener creation
 */
const MAX_LISTENERS_HARD_LIMIT = 10_000;

/**
 * Invoke all listeners for a given event.
 *
 * @template E - Event literal type.
 * @param eventName - The event being dispatched (used only for logging).
 * @param set - Array of callbacks (or undefined).
 * @param args - Arguments to pass to each callback.
 */
function invokeFor<E extends EventName>(
  eventName: E,
  set: Set<Plugin[EventMethodMap[E]]>,
  ...args: Parameters<NonNullable<Plugin[EventMethodMap[E]]>>
): void {
  if (set.size === 0) {
    return;
  }

  // Clone the listeners array so that removals/additions
  // during iteration won't affect this loop.
  const listeners = [...set];

  for (const cb of listeners) {
    // Note: cb is guaranteed to be a function because addEventListener
    // validates typeof cb === "function" before adding to the set
    try {
      // We can't use cb(...args) due to TypeScript limitations with
      // conditional types, so we use this pattern to invoke the callback
      // with the correct number of arguments from the args array
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Function.prototype.apply requires Function type
      Function.prototype.apply.call(cb as Function, undefined, args);
    } catch (error) {
      console.error(`[Router] Error in listener for ${eventName}:`, error);
    }
  }
}

export function withObservability<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  /**
   * Event listeners storage. Using Set for O(1) operations and automatic deduplication.
   * Sets are created lazily to reduce memory footprint when events are not used.
   *
   * Type-safe lazy map that preserves the relationship between event names and their callback types.
   */
  type CallbackSet<E extends EventName> = Set<Plugin[EventMethodMap[E]]>;
  type CallbacksMap = {
    [E in EventName]?: CallbackSet<E>;
  };
  const callbacks: CallbacksMap = {};

  /**
   * Gets or creates a Set for the given event name (lazy initialization)
   */
  function getCallbackSet<E extends EventName>(eventName: E): CallbackSet<E> {
    const existing = callbacks[eventName];

    if (existing) {
      return existing;
    }

    const set = new Set<Plugin[EventMethodMap[E]]>();

    // Type assertion needed: TS can't narrow generic E to specific event name
    (callbacks as Record<E, CallbackSet<E>>)[eventName] = set;

    return set;
  }

  /**
   * Tracks current recursion depth for each event type.
   * Created lazily to reduce memory footprint when events are not dispatched.
   */
  let eventDepthMap: Record<EventName, number> | null = null;

  /**
   * Gets or creates the event depth map (lazy initialization)
   */
  const getEventDepthMap = (): Record<EventName, number> => {
    eventDepthMap ??= {
      [events.ROUTER_START]: 0,
      [events.TRANSITION_START]: 0,
      [events.TRANSITION_SUCCESS]: 0,
      [events.TRANSITION_ERROR]: 0,
      [events.TRANSITION_CANCEL]: 0,
      [events.ROUTER_STOP]: 0,
    };

    return eventDepthMap;
  };

  /**
   * Valid event names for validation (avoids creating objects just for hasOwn check)
   */
  const validEventNames = new Set<EventName>([
    events.ROUTER_START,
    events.TRANSITION_START,
    events.TRANSITION_SUCCESS,
    events.TRANSITION_ERROR,
    events.TRANSITION_CANCEL,
    events.ROUTER_STOP,
  ]);

  /**
   * Validates arguments for invokeEventListeners to prevent runtime errors.
   * Checks event name validity, recursion depth, and parameter types.
   * Throws descriptive errors for debugging instead of silent failures.
   */
  const isInvokeEventListenersArgumentsValid = (
    eventName: (typeof events)[EventsKeys],
  ) => {
    if (!validEventNames.has(eventName)) {
      throw new Error(`Invalid event name: ${eventName}`);
    }

    const depthMap = getEventDepthMap();
    const depth = depthMap[eventName];

    if (depth >= MAX_EVENT_DEPTH) {
      throw new Error(
        `[Router] Maximum recursion depth (${MAX_EVENT_DEPTH}) exceeded for event: ${eventName}`,
      );
    }
  };

  /**
   * Validates arguments for add/removeEventListener operations.
   * Ensures event name is valid and callback is a function.
   * Critical for preventing invalid subscriptions that could cause memory leaks.
   */
  const isAddRemoveEventListenersArgumentsValid = <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => {
    if (!validEventNames.has(eventName)) {
      throw new Error(`Invalid event name: ${eventName}`);
    }

    if (typeof cb !== "function") {
      throw new TypeError(
        `Expected callback to be a function for event ${eventName}`,
      );
    }
  };

  /**
   * @internal Central event dispatcher for router core
   * * Uses only for navigate method.
   */
  router.invokeEventListeners = (
    eventName: (typeof events)[EventsKeys],
    toState?: State,
    fromState?: State,
    arg?: RouterErrorType | NavigationOptions,
    // eslint-disable-next-line sonarjs/cognitive-complexity
  ) => {
    isInvokeEventListenersArgumentsValid(eventName);

    const depthMap = getEventDepthMap();

    try {
      depthMap[eventName]++;

      switch (eventName) {
        case events.TRANSITION_START:
        case events.TRANSITION_CANCEL: {
          if (!toState) {
            throw new TypeError(
              `[router.invokeEventListeners] toState is required for event "${eventName}"`,
            );
          }

          // TODO(private-api): Remove isState() validation when method becomes protected.
          // All internal callers pass states from makeState() (already validated) or getState().
          // Potential savings: ~56-877 ns per call (depends on params depth)
          if (!isState(toState)) {
            throw new TypeError(
              `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
                `Expected State object with name, path, and params.`,
            );
          }

          // TODO(private-api): Remove when method becomes protected (fromState from getState())
          if (fromState && !isState(fromState)) {
            throw new TypeError(
              `[router.invokeEventListeners] fromState is invalid for event "${eventName}". ` +
                `Expected State object with name, path, and params.`,
            );
          }

          // States are already frozen: toState from makeState(), fromState from getState()
          // Use getCallbackSet for lazy initialization
          invokeFor(eventName, getCallbackSet(eventName), toState, fromState);

          break;
        }
        case events.TRANSITION_ERROR: {
          // TODO(private-api): Remove isState() validations when method becomes protected.
          // States come from makeState() or getState() - already validated.
          if (toState && !isState(toState)) {
            throw new TypeError(
              `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
                `Expected State object with name, path, and params.`,
            );
          }

          // TODO(private-api): Remove when method becomes protected
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

          // States are already frozen if provided: toState from makeState(), fromState from getState()
          // Use getCallbackSet for lazy initialization
          invokeFor(
            eventName,
            getCallbackSet(eventName),
            toState,
            fromState,
            arg,
          );

          break;
        }
        case events.TRANSITION_SUCCESS: {
          if (!toState) {
            throw new TypeError(
              `[router.invokeEventListeners] toState is required for event "${eventName}"`,
            );
          }

          // TODO(private-api): Remove isState() validations when method becomes protected.
          // States come from makeState() or getState() - already validated.
          if (!isState(toState)) {
            throw new TypeError(
              `[router.invokeEventListeners] toState is invalid for event "${eventName}". ` +
                `Expected State object with name, path, and params.`,
            );
          }

          // TODO(private-api): Remove when method becomes protected
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

          // States are already frozen: toState from makeState(), fromState from getState()
          // Use getCallbackSet for lazy initialization
          invokeFor(
            eventName,
            getCallbackSet(eventName),
            toState,
            fromState,
            arg,
          );

          break;
        }
        // for events.ROUTER_START, events.ROUTER_STOP
        default: {
          // Exhaustive check: at this point only ROUTER_START and ROUTER_STOP should remain
          // TypeScript will error if new event types are added without handling them above
          const _exhaustiveCheck:
            | typeof events.ROUTER_START
            | typeof events.ROUTER_STOP = eventName;

          // Use getCallbackSet for lazy initialization
          invokeFor(_exhaustiveCheck, getCallbackSet(_exhaustiveCheck));

          break;
        }
      }
    } finally {
      depthMap[eventName]--;
    }
  };

  /**
   * Checks if there are any listeners registered for a given event.
   * Used for performance optimization to skip event emission when no listeners exist.
   *
   * @param eventName - The event to check for listeners
   * @returns true if at least one listener is registered, false otherwise
   *
   * @example
   * ```typescript
   * // Skip expensive event emission if no listeners
   * if (router.hasListeners(events.TRANSITION_ERROR)) {
   *   router.invokeEventListeners(events.TRANSITION_ERROR, ...);
   * }
   * ```
   *
   * @internal
   */
  router.hasListeners = (eventName: (typeof events)[EventsKeys]): boolean => {
    if (!validEventNames.has(eventName)) {
      return false;
    }

    const set = callbacks[eventName];

    return set !== undefined && set.size > 0;
  };

  /**
   * @internal Use unsubscribe function returned by addEventListener
   * Uses only for plugins.
   * @deprecated Will be protected in next major version
   */
  router.removeEventListener = <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => {
    isAddRemoveEventListenersArgumentsValid(eventName, cb);

    // Don't create Set just for removal - check if it exists first
    const set = callbacks[eventName];

    if (!set || set.size === 0) {
      return;
    }

    const deleted = set.delete(cb);

    if (!deleted) {
      // Need for debugging purposes, as it is not an error to remove a listener that was never added.
      // This can happen if the listener was already removed or never added.
      console.warn(
        `[Router] Attempted to remove non-existent listener for "${eventName}". ` +
          `This might indicate a memory leak or incorrect cleanup logic.`,
      );
    }
  };

  router.addEventListener = <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe => {
    isAddRemoveEventListenersArgumentsValid(eventName, cb);

    const set = getCallbackSet(eventName);

    if (set.has(cb)) {
      throw new Error(
        `[router.addEventListener] Listener already exists for event "${eventName}". ` +
          `Each listener function can only be registered once per event. ` +
          `Store the returned unsubscribe function to remove the listener.`,
      );
    }

    if (set.size === 1000) {
      console.warn(
        `[router.addEventListener] Warning: Event "${eventName}" has ${set.size} listeners. ` +
          `This might indicate a memory leak.`,
      );
    }

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
      router.removeEventListener(eventName, cb);
    };
  };

  /**
   * Simple subscription API for navigation success events
   */
  function subscribe(listener: SubscribeFn): Unsubscribe {
    if (typeof listener !== "function") {
      throw new TypeError(
        "[router.subscribe] Expected a function. " +
          "For Observable pattern use router[Symbol.observable]().subscribe(observer)",
      );
    }

    return router.addEventListener(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        // States are already frozen: toState from makeState(), fromState from getState()
        listener({
          route: toState,
          previousRoute: fromState,
        });
      },
    );
  }

  router.subscribe = subscribe;

  /**
   * Observable symbol - TC39 proposal with fallback
   * Runtime check needed despite type declaration because Symbol.observable
   * is not yet standard in all environments
   *
   * @see https://github.com/tc39/proposal-observable
   */
  const $$observable: typeof Symbol.observable =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for environments without Symbol.observable
    (typeof Symbol === "function" && Symbol.observable) ||
    ("@@observable" as unknown as typeof Symbol.observable);

  /**
   * Track active observers for deduplication
   * Using WeakMap to allow garbage collection of observers
   */
  const observerSubscriptions = new WeakMap<
    Observer,
    { unsubscribe: Unsubscribe; active: boolean }
  >();

  /**
   * Observer interface per Observable spec
   */
  interface Observer {
    next?: (value: SubscribeState) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }

  /**
   * Subscription interface per Observable spec
   */
  interface Subscription {
    unsubscribe: () => void;
    readonly closed: boolean;
  }

  /**
   * Observable options for enhanced control
   */
  interface ObservableOptions {
    /** AbortSignal for automatic unsubscription */
    signal?: AbortSignal;
    /** Replay current state to new subscribers (default: true) */
    replay?: boolean;
  }

  interface SubscribeState {
    route: State;
    previousRoute: State | undefined;
  }

  /**
   * Observable interface for TC39 compliance
   */
  interface RouterObservable {
    [key: symbol]: () => RouterObservable;
    subscribe: (
      observer: Observer | ((value: SubscribeState) => void),
      options?: ObservableOptions,
    ) => Subscription;
  }

  /**
   * Modern Observable implementation with:
   * - Deduplication: same observer can only subscribe once
   * - Error isolation: errors in one observer don't affect others
   * - Replay: new subscribers receive current state immediately
   * - AbortSignal: automatic cleanup with AbortController
   * - TC39 Observable spec compliance
   */
  function observable(): RouterObservable {
    return {
      /**
       * Subscribe to router state changes
       *
       * @example
       * // Basic subscription
       * const subscription = router[Symbol.observable]().subscribe({
       *   next: ({ route, previousRoute }) => console.log(route.name)
       * });
       *
       * @example
       * // With AbortController
       * const controller = new AbortController();
       * router[Symbol.observable]().subscribe(
       *   { next: ({ route }) => console.log(route) },
       *   { signal: controller.signal }
       * );
       * // Later: controller.abort();
       */
      subscribe(
        observer: Observer | ((value: SubscribeState) => void),
        options: ObservableOptions = {},
      ): Subscription {
        // Normalize observer
        const normalizedObserver: Observer =
          typeof observer === "function" ? { next: observer } : observer;

        // Check for duplicate subscription
        const existing = observerSubscriptions.get(normalizedObserver);

        if (existing?.active) {
          console.warn(
            "[router.observable] Duplicate subscription prevented. Same observer already subscribed.",
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
              console.error(
                "[router.observable] Error in observer.next:",
                error,
              );

              // Call error handler if provided
              if (normalizedObserver.error) {
                try {
                  normalizedObserver.error(error);
                } catch (errorHandlerError) {
                  console.error(
                    "[router.observable] Error in observer.error:",
                    errorHandlerError,
                  );
                }
              }
            }
          }
        };

        // Internal event listener
        const eventListener = (toState: State, fromState?: State) => {
          safeNext({
            route: toState,
            previousRoute: fromState,
          });
        };

        // Subscribe to transition success events
        const unsubscribeListener = router.addEventListener(
          events.TRANSITION_SUCCESS,
          eventListener,
        );

        // Create subscription object
        const subscription: { unsubscribe: Unsubscribe; active: boolean } = {
          unsubscribe: () => {
            if (closed) {
              return;
            }

            closed = true;
            subscription.active = false;
            unsubscribeListener();

            // Call complete handler
            if (normalizedObserver.complete) {
              try {
                normalizedObserver.complete();
              } catch (error) {
                console.error(
                  "[router.observable] Error in observer.complete:",
                  error,
                );
              }
            }
          },
          active: true,
        };

        // Track subscription for deduplication
        observerSubscriptions.set(normalizedObserver, subscription);

        // Handle AbortSignal
        if (signal) {
          const abortHandler = () => {
            subscription.unsubscribe();
          };

          signal.addEventListener("abort", abortHandler, { once: true });
        }

        // Replay current state if requested and available
        if (replay) {
          const currentState = router.getState();

          if (currentState) {
            // Use queueMicrotask for async replay to match Observable semantics
            queueMicrotask(() => {
              safeNext({
                route: currentState,
                previousRoute: undefined,
              });
            });
          }
        }

        return {
          unsubscribe: subscription.unsubscribe,
          get closed() {
            return closed;
          },
        };
      },

      /**
       * Observable symbol for interop with RxJS and other libraries
       */
      [$$observable](): RouterObservable {
        return this;
      },
    };
  }

  // Attach observable to router
  router[$$observable] = observable;

  return router;
}
