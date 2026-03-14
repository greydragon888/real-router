// packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts

import { events } from "../../constants";
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

  static validateSubscribeListener(listener: unknown): void {
    if (typeof listener !== "function") {
      throw new TypeError(
        "[router.subscribe] Expected a function. " +
          "For Observable pattern use @real-router/rx package",
      );
    }
  }

  emitRouterStart(): void {
    this.#emitter.emit(events.ROUTER_START);
  }

  emitRouterStop(): void {
    this.#emitter.emit(events.ROUTER_STOP);
  }

  emitTransitionStart(toState: State, fromState?: State): void {
    this.#emitter.emit(events.TRANSITION_START, toState, fromState);
  }

  emitTransitionSuccess(
    toState: State,
    fromState?: State,
    opts?: NavigationOptions,
  ): void {
    this.#emitter.emit(events.TRANSITION_SUCCESS, toState, fromState, opts);
  }

  emitTransitionError(
    toState?: State,
    fromState?: State,
    error?: RouterError,
  ): void {
    this.#emitter.emit(events.TRANSITION_ERROR, toState, fromState, error);
  }

  emitTransitionCancel(toState: State, fromState?: State): void {
    this.#emitter.emit(events.TRANSITION_CANCEL, toState, fromState);
  }

  sendStart(): void {
    this.#fsm.send(routerEvents.START);
  }

  sendStop(): void {
    this.#fsm.send(routerEvents.STOP);
  }

  sendDispose(): void {
    this.#fsm.send(routerEvents.DISPOSE);
  }

  sendStarted(): void {
    this.#fsm.send(routerEvents.STARTED);
  }

  sendNavigate(toState: State, fromState?: State): void {
    this.#currentToState = toState;
    this.#fsm.send(routerEvents.NAVIGATE, { toState, fromState });
  }

  sendComplete(
    state: State,
    fromState?: State,
    opts: NavigationOptions = {},
  ): void {
    const prev = this.#currentToState;

    this.#fsm.send(routerEvents.COMPLETE, {
      state,
      fromState,
      opts,
    });

    if (this.#currentToState === prev) {
      this.#currentToState = undefined;
    }
  }

  sendFail(toState?: State, fromState?: State, error?: unknown): void {
    const prev = this.#currentToState;

    this.#fsm.send(routerEvents.FAIL, { toState, fromState, error });

    if (this.#currentToState === prev) {
      this.#currentToState = undefined;
    }
  }

  sendFailSafe(toState?: State, fromState?: State, error?: unknown): void {
    if (this.isReady()) {
      this.sendFail(toState, fromState, error);
    } else {
      this.emitTransitionError(toState, fromState, error as RouterError);
    }
  }

  sendCancel(toState: State, fromState?: State): void {
    const prev = this.#currentToState;

    this.#fsm.send(routerEvents.CANCEL, { toState, fromState });

    if (this.#currentToState === prev) {
      this.#currentToState = undefined;
    }
  }

  canBeginTransition(): boolean {
    return this.#fsm.canSend(routerEvents.NAVIGATE);
  }

  canStart(): boolean {
    return this.#fsm.canSend(routerEvents.START);
  }

  canCancel(): boolean {
    return this.#fsm.canSend(routerEvents.CANCEL);
  }

  isActive(): boolean {
    const s = this.#fsm.getState();

    return s !== routerStates.IDLE && s !== routerStates.DISPOSED;
  }

  isDisposed(): boolean {
    return this.#fsm.getState() === routerStates.DISPOSED;
  }

  isTransitioning(): boolean {
    return this.#fsm.getState() === routerStates.TRANSITIONING;
  }

  isReady(): boolean {
    return this.#fsm.getState() === routerStates.READY;
  }

  getCurrentToState(): State | undefined {
    return this.#currentToState;
  }

  addEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    return this.#emitter.on(
      eventName,
      cb as (...args: RouterEventMap[typeof eventName]) => void,
    );
  }

  subscribe(listener: SubscribeFn): Unsubscribe {
    return this.#emitter.on(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        listener({ route: toState, previousRoute: fromState });
      },
    );
  }

  clearAll(): void {
    this.#emitter.clearAll();
  }

  setLimits(limits: {
    maxListeners: number;
    warnListeners: number;
    maxEventDepth: number;
  }): void {
    this.#emitter.setLimits(limits);
  }

  sendCancelIfTransitioning(fromState: State | undefined): void {
    if (!this.canCancel()) {
      return;
    }

    this.sendCancel(this.#currentToState!, fromState); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
  }

  #setupFSMActions(): void {
    const fsm = this.#fsm;

    fsm.on(routerStates.STARTING, routerEvents.STARTED, () => {
      this.emitRouterStart();
    });

    fsm.on(routerStates.READY, routerEvents.STOP, () => {
      this.emitRouterStop();
    });

    fsm.on(routerStates.READY, routerEvents.NAVIGATE, (params) => {
      this.emitTransitionStart(params.toState, params.fromState);
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.COMPLETE, (params) => {
      this.emitTransitionSuccess(params.state, params.fromState, params.opts);
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.CANCEL, (params) => {
      this.emitTransitionCancel(params.toState, params.fromState);
    });

    fsm.on(routerStates.STARTING, routerEvents.FAIL, (params) => {
      this.emitTransitionError(
        params.toState,
        params.fromState,
        params.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.READY, routerEvents.FAIL, (params) => {
      this.emitTransitionError(
        params.toState,
        params.fromState,
        params.error as RouterError | undefined,
      );
    });

    fsm.on(routerStates.TRANSITIONING, routerEvents.FAIL, (params) => {
      this.emitTransitionError(
        params.toState,
        params.fromState,
        params.error as RouterError | undefined,
      );
    });
  }
}
