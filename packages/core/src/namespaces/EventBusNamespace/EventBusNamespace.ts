// packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts

import { events, validEventNames } from "../../constants";
import { routerEvents, routerStates } from "../../fsm";

import type { EventBusOptions } from "./types";
import type { RouterEvent, RouterPayloads, RouterState } from "../../fsm";
import type { RouterError } from "../../RouterError";
import type { EventMethodMap, RouterEventMap } from "../../types";
import type { FSM } from "@real-router/fsm";
import type {
  EventName,
  NavigationOptions,
  Plugin,
  State,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";
import type { EventEmitter } from "event-emitter";

const stubUnsubscribe: Unsubscribe = () => undefined;

export class EventBusNamespace {
  readonly #fsm: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  readonly #emitter: EventEmitter<RouterEventMap>;

  #currentToState: State | undefined;

  constructor(options: EventBusOptions) {
    this.#fsm = options.routerFSM;
    this.#emitter = options.emitter;
    this.#currentToState = undefined;
    this.#setupFSMActions();
  }

  static validateEventName(eventName: unknown): void {
    if (!validEventNames.has(eventName as EventName)) {
      throw new Error(`Invalid event name: ${String(eventName)}`);
    }
  }

  static validateListenerArgs<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): void {
    EventBusNamespace.validateEventName(eventName);

    if (typeof cb !== "function") {
      throw new TypeError(
        `Expected callback to be a function for event ${eventName}`,
      );
    }
  }

  static validateSubscribeListener(listener: unknown): void {
    if (typeof listener !== "function") {
      throw new TypeError(
        "[router.subscribe] Expected a function. " +
          "For Observable pattern use @real-router/rx package",
      );
    }
  }

  emitRouterStart(): void {
    // TODO: implement in Task 2
  }

  emitRouterStop(): void {
    // TODO: implement in Task 2
  }

  emitTransitionStart(_toState: State, _fromState?: State): void {
    // TODO: implement in Task 2
  }

  emitTransitionSuccess(
    _toState: State,
    _fromState?: State,
    _opts?: NavigationOptions,
  ): void {
    // TODO: implement in Task 2
  }

  emitTransitionError(
    _toState?: State,
    _fromState?: State,
    _error?: RouterError,
  ): void {
    // TODO: implement in Task 2
  }

  emitTransitionCancel(_toState: State, _fromState?: State): void {
    // TODO: implement in Task 2
  }

  sendStart(): void {
    // TODO: implement in Task 2
  }

  sendStop(): void {
    // TODO: implement in Task 2
  }

  sendDispose(): void {
    // TODO: implement in Task 2
  }

  completeStart(): void {
    // TODO: implement in Task 2
  }

  beginTransition(_toState: State, _fromState?: State): void {
    // TODO: implement in Task 2
  }

  completeTransition(
    _state: State,
    _fromState?: State,
    _opts?: NavigationOptions,
  ): void {
    // TODO: implement in Task 2
  }

  failTransition(_toState?: State, _fromState?: State, _error?: unknown): void {
    // TODO: implement in Task 2
  }

  cancelTransition(_toState: State, _fromState?: State): void {
    // TODO: implement in Task 2
  }

  emitOrFailTransitionError(
    _toState?: State,
    _fromState?: State,
    _error?: unknown,
  ): void {
    // TODO: implement in Task 2
  }

  canBeginTransition(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  canStart(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  canCancel(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  isActive(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  isDisposed(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  isTransitioning(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  isReady(): boolean {
    // TODO: implement in Task 2
    return false;
  }

  getState(): RouterState {
    // TODO: implement in Task 2
    return this.#fsm.getState();
  }

  getCurrentToState(): State | undefined {
    // TODO: implement in Task 2
    return this.#currentToState;
  }

  setCurrentToState(state: State | undefined): void {
    // TODO: implement in Task 2
    this.#currentToState = state;
  }

  addEventListener<E extends EventName>(
    _eventName: E,
    _cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    // TODO: implement in Task 2
    return stubUnsubscribe;
  }

  subscribe(_listener: SubscribeFn): Unsubscribe {
    // TODO: implement in Task 2
    return stubUnsubscribe;
  }

  clearAll(): void {
    // TODO: implement in Task 2
  }

  setLimits(_limits: {
    maxListeners: number;
    warnListeners: number;
    maxEventDepth: number;
  }): void {
    // TODO: implement in Task 2
  }

  cancelTransitionIfRunning(_fromState: State | undefined): void {
    // TODO: implement in Task 2
  }

  #setupFSMActions(): void {
    const fsm = this.#fsm;

    fsm.on(routerStates.STARTING, routerEvents.STARTED, () => {
      this.#emitter.emit(events.ROUTER_START);
    });

    fsm.on(routerStates.READY, routerEvents.STOP, () => {
      this.#emitter.emit(events.ROUTER_STOP);
    });

    fsm.on(routerStates.READY, routerEvents.NAVIGATE, (p) => {
      this.#emitter.emit(events.TRANSITION_START, p.toState, p.fromState);
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.COMPLETE, (p) => {
      this.#emitter.emit(
        events.TRANSITION_SUCCESS,
        p.state,
        p.fromState,
        p.opts,
      );
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.CANCEL, (p) => {
      this.#emitter.emit(events.TRANSITION_CANCEL, p.toState, p.fromState);
    });

    fsm.on(routerStates.STARTING, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.READY, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.FAIL, (p) => {
      this.#emitter.emit(
        events.TRANSITION_ERROR,
        p.toState,
        p.fromState,
        p.error as RouterError | undefined,
      );
    });
  }
}
