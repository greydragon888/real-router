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
  LeaveFn,
  LeaveState,
  NavigationOptions,
  Plugin,
  State,
  SubscribeFn,
  Unsubscribe,
} from "@real-router/types";
import type { EventEmitter } from "event-emitter";

function settleLeavePromises(
  promises: Promise<void>[],
  firstSyncError: unknown,
): Promise<void> {
  return Promise.allSettled(promises).then((results) => {
    if (firstSyncError !== undefined) {
      throw firstSyncError as Error;
    }

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (rejected !== undefined) {
      throw rejected.reason as Error;
    }
  });
}

export class EventBusNamespace {
  readonly #fsm: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  readonly #emitter: EventEmitter<RouterEventMap>;
  readonly #leaveListeners: LeaveFn[] = [];

  #currentToState: State | undefined;
  #pendingToState: State | undefined;
  #pendingFromState: State | undefined;
  #pendingError: unknown;

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

  static validateSubscribeLeaveListener(listener: unknown): void {
    if (typeof listener !== "function") {
      throw new TypeError("[router.subscribeLeave] Expected a function");
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

  emitTransitionLeaveApprove(toState: State, fromState?: State): void {
    this.#emitter.emit(events.TRANSITION_LEAVE_APPROVE, toState, fromState);
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
    // Bypass FSM dispatch — forceState + direct emit (no action lookup, no rest params)
    this.#fsm.forceState(routerStates.TRANSITION_STARTED);
    this.emitTransitionStart(toState, fromState);
  }

  sendComplete(
    state: State,
    fromState?: State,
    opts: NavigationOptions = {},
  ): void {
    // Bypass FSM dispatch — forceState + direct emit
    this.#fsm.forceState(routerStates.READY);
    this.emitTransitionSuccess(state, fromState, opts);

    if (this.#currentToState === state) {
      this.#currentToState = undefined;
    }
  }

  sendLeaveApprove(toState: State, fromState?: State): void {
    // Bypass FSM dispatch — forceState + direct emit (no action lookup, no rest params)
    this.#fsm.forceState(routerStates.LEAVE_APPROVED);
    this.emitTransitionLeaveApprove(toState, fromState);
  }

  sendFail(toState?: State, fromState?: State, error?: unknown): void {
    const prev = this.#currentToState;

    this.#pendingToState = toState;
    this.#pendingFromState = fromState;
    this.#pendingError = error;
    this.#fsm.send(routerEvents.FAIL);

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

    this.#pendingToState = toState;
    this.#pendingFromState = fromState;
    this.#fsm.send(routerEvents.CANCEL);

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
    const fsmState = this.#fsm.getState();

    return fsmState !== routerStates.IDLE && fsmState !== routerStates.DISPOSED;
  }

  isDisposed(): boolean {
    return this.#fsm.getState() === routerStates.DISPOSED;
  }

  isTransitioning(): boolean {
    const state = this.#fsm.getState();

    return (
      state === routerStates.TRANSITION_STARTED ||
      state === routerStates.LEAVE_APPROVED
    );
  }

  isLeaveApproved(): boolean {
    return this.#fsm.getState() === routerStates.LEAVE_APPROVED;
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

  subscribeLeave(listener: LeaveFn): Unsubscribe {
    this.#leaveListeners.push(listener);

    return () => {
      const idx = this.#leaveListeners.indexOf(listener);

      if (idx !== -1) {
        this.#leaveListeners.splice(idx, 1);
      }
    };
  }

  hasLeaveListeners(): boolean {
    return this.#leaveListeners.length > 0;
  }

  awaitLeaveListeners(
    toState: State,
    fromState: State | undefined,
    signal: AbortSignal,
  ): Promise<void> | undefined {
    if (fromState === undefined) {
      return undefined;
    }

    const leaveState: LeaveState = {
      route: fromState,
      nextRoute: toState,
      signal,
    };

    let promises: Promise<void>[] | undefined;
    let firstSyncError: unknown;

    for (const listener of this.#leaveListeners) {
      try {
        const result = listener(leaveState);

        if (result !== undefined && typeof result.then === "function") {
          promises ??= [];
          promises.push(result);
        }
      } catch (error: unknown) {
        if (firstSyncError === undefined) {
          firstSyncError = error;
        }
      }
    }

    if (promises === undefined) {
      if (firstSyncError !== undefined) {
        throw firstSyncError as Error;
      }

      return undefined;
    }

    return settleLeavePromises(promises, firstSyncError);
  }

  clearAll(): void {
    this.#emitter.clearAll();
    this.#leaveListeners.length = 0;
  }

  setLimits(limits: {
    maxListeners: number;
    warnListeners: number;
    maxEventDepth: number;
  }): void {
    this.#emitter.setLimits(limits);
  }

  sendCancelIfPossible(fromState: State | undefined): void {
    const toState = this.#currentToState;

    if (!this.canCancel() || toState === undefined) {
      return;
    }

    this.sendCancel(toState, fromState);
  }

  #emitPendingError(): void {
    this.emitTransitionError(
      this.#pendingToState,
      this.#pendingFromState,
      this.#pendingError as RouterError | undefined,
    );
  }

  #setupFSMActions(): void {
    const fsm = this.#fsm;

    fsm.on(routerStates.STARTING, routerEvents.STARTED, () => {
      this.emitRouterStart();
    });

    fsm.on(routerStates.READY, routerEvents.STOP, () => {
      this.emitRouterStop();
    });

    // NAVIGATE and COMPLETE actions bypassed — sendNavigate/sendComplete
    // use fsm.forceState() + direct emit for zero-allocation hot path.
    const handleCancel = () => {
      const toState = this.#pendingToState;

      /* v8 ignore next -- @preserve: #pendingToState guaranteed set by sendCancel before send() */
      if (toState === undefined) {
        return;
      }

      this.emitTransitionCancel(toState, this.#pendingFromState);
    };

    fsm.on(routerStates.TRANSITION_STARTED, routerEvents.CANCEL, handleCancel);
    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.CANCEL, handleCancel);

    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.FAIL, () => {
      this.#emitPendingError();
    });

    fsm.on(routerStates.STARTING, routerEvents.FAIL, () => {
      this.#emitPendingError();
    });

    fsm.on(routerStates.READY, routerEvents.FAIL, () => {
      this.#emitPendingError();
    });

    fsm.on(routerStates.TRANSITION_STARTED, routerEvents.FAIL, () => {
      this.#emitPendingError();
    });
  }
}
