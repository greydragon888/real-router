// packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts

import { errorCodes, events } from "../../constants";
import { routerEvents, routerStates } from "../../fsm";
import { RouterError } from "../../RouterError";

import type { EventBusOptions } from "./types";
import type { EventEmitter } from "../../foundation/event-emitter";
import type { FSM } from "../../foundation/fsm";
import type { RouterEvent, RouterPayloads, RouterState } from "../../fsm";
import type { EventMethodMap, RouterEventMap } from "../../types";
import type { RouterValidator } from "../../types/RouterValidator";
import type {
  EventName,
  LeaveFn,
  LeaveState,
  NavigationOptions,
  Plugin,
  State,
  SubscribeFn,
  TreeChangedEvent,
  Unsubscribe,
} from "@real-router/types";

/**
 * Internal-only event key for route-tree mutations. Lives on the same
 * `EventEmitter` as the 7 transition events but never enters the public
 * `EventName` union — reachable only through
 * `getRoutesApi(router).subscribeChanges()`.
 */
const TREE_CHANGED = "TREE_CHANGED";

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function settleLeavePromises(
  promises: Promise<void>[],
  firstSyncError: unknown,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // #1197 — canonicalize the abort outcome: reject with a
    // `RouterError(TRANSITION_CANCELLED)` carrying the external reason, so the
    // no-guards leave path classifies identically to the guard path (no raw
    // reject, no spurious TRANSITION_ERROR). Internal sources
    // (supersede/stop/dispose) already abort with such a RouterError — thread it
    // through unchanged so the #943 reason is preserved.
    const onAbort = (): void => {
      const reason: unknown = signal.reason;

      reject(
        reason instanceof RouterError &&
          reason.code === errorCodes.TRANSITION_CANCELLED
          ? reason
          : new RouterError(errorCodes.TRANSITION_CANCELLED, { reason }),
      );
    };

    if (signal.aborted) {
      onAbort();

      return;
    }

    // Stryker disable next-line ObjectLiteral,BooleanLiteral: equivalent — `{ once: true }` is redundant: onAbort fires at most once (a signal aborts once) and the success path explicitly removeEventListener's it, so dropping `once` is unobservable. StringLiteral sibling stays live (the "abort" event name is killed).
    signal.addEventListener("abort", onAbort, { once: true });

    void Promise.allSettled(promises).then((results) => {
      // Stryker disable next-line StringLiteral: equivalent — this cleanup name is redundant: onAbort is registered with `{ once: true }` and the per-navigation signal is discarded unaborted on success, so failing to remove the listener leaks nothing observable.
      signal.removeEventListener("abort", onAbort);

      // Stryker disable next-line BlockStatement: equivalent — emptying the post-allSettled abort-race early-return falls through to resolve()/reject(), but the abort handler already settled the promise, so the extra settle is a no-op. CE sibling stays live (→true hangs the pipeline = killed via timeout).
      if (signal.aborted) {
        // Race lost to abort — the abort handler already rejected; do nothing
        return;
      }

      if (firstSyncError !== undefined) {
        reject(ensureError(firstSyncError));

        return;
      }

      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );

      if (rejected !== undefined) {
        reject(ensureError(rejected.reason));

        return;
      }

      resolve();
    });
  });
}

export class EventBusNamespace {
  readonly #fsm: FSM<RouterState, RouterEvent, null, RouterPayloads>;
  readonly #emitter: EventEmitter<RouterEventMap>;
  // Effect of the FSM CANCEL action: aborts the in-flight navigation's
  // controller. Wired to NavigationNamespace.
  readonly #abortController: (reason?: unknown) => void;
  // Lazy accessor for the opt-in RouterValidator (wired by wireNamespaces).
  // Returns `null` until validation-plugin is registered — so the proactive
  // listener-count threshold (#1188) costs the no-plugin path nothing.
  #getValidator: (() => RouterValidator | null) | undefined;
  readonly #leaveListeners: LeaveFn[] = [];

  // Depth of the synchronous transition-dispatch window — elevated while a
  // transition event is being emitted (`emitTransition*`) or a `subscribeLeave`
  // listener batch runs. `isProcessing()` reads it so the navigation facade can
  // reject a synchronous reentrant navigate() from inside a transition listener
  // with REENTRANT_NAVIGATION (RFC navigation-cancellation-unification §4). A
  // counter (not a boolean) tolerates legitimately-nested transition emits. The
  // ceiling-bounded "allow reentrant navigate, throw RecursionDepthError at
  // `maxEventDepth`" behaviour (#935/#945) is gone: such a navigate now throws
  // REENTRANT_NAVIGATION at depth 1, before it can recurse. (The emitter's old
  // `maxEventDepth` depth-bound is gone too — re-entrant emits are coalesced to a
  // no-op at the emitter, #1033 — so no event can re-enter its own dispatch.)
  #dispatchDepth = 0;

  #currentToState: State | undefined;
  #pendingToState: State | undefined;
  #pendingFromState: State | undefined;
  #pendingError: unknown;
  // Abort reason for the pending CANCEL — read by handleCancel, set by sendCancel.
  #pendingCancelReason: unknown;

  constructor(options: EventBusOptions) {
    this.#fsm = options.routerFSM;
    this.#emitter = options.emitter;
    this.#abortController = options.abortController;
    this.#currentToState = undefined;
    this.#setupFSMActions();
  }

  static validateSubscribeListener(listener: unknown): void {
    if (typeof listener !== "function") {
      throw new TypeError(
        "[router.subscribe] Expected a function. " +
          "For Observable pattern use observable(router) from @real-router/rx",
      );
    }
  }

  /**
   * Validates the `subscribeLeave` listener. Unlike
   * {@link validateSubscribeListener}, the error carries **no**
   * `@real-router/rx` hint — rx exposes the Observable pattern for *success*
   * transitions (`observable(router)`, `state$`, `events$`), not for leave
   * events, so steering leave-listener misuse toward rx would mislead. The
   * asymmetry is intentional (mirrored in `core/CLAUDE.md`).
   */
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
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.TRANSITION_START, toState, fromState);
    } finally {
      this.#dispatchDepth--;
    }
  }

  emitTransitionSuccess(
    toState: State,
    fromState?: State,
    opts?: NavigationOptions,
  ): void {
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.TRANSITION_SUCCESS, toState, fromState, opts);
    } finally {
      this.#dispatchDepth--;
    }
  }

  emitTransitionError(
    toState?: State,
    fromState?: State,
    error?: RouterError,
  ): void {
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.TRANSITION_ERROR, toState, fromState, error);
    } finally {
      this.#dispatchDepth--;
    }
  }

  emitTransitionCancel(toState: State, fromState?: State): void {
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.TRANSITION_CANCEL, toState, fromState);
    } finally {
      this.#dispatchDepth--;
    }
  }

  emitTransitionLeaveApprove(toState: State, fromState?: State): void {
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.TRANSITION_LEAVE_APPROVE, toState, fromState);
    } finally {
      this.#dispatchDepth--;
    }
  }

  /**
   * True while a transition event is being dispatched synchronously — an
   * `emitTransition*` call or a `subscribeLeave` listener batch is on the stack.
   * The navigation facade reads this to reject a synchronous reentrant
   * navigate() from inside a transition listener (RFC §4).
   */
  isProcessing(): boolean {
    return this.#dispatchDepth > 0;
  }

  /**
   * Emits the internal `TREE_CHANGED` event after a structural route-tree
   * mutation. Reuses the shared `EventEmitter` — so re-entrancy coalescing
   * (#1033) and per-listener error isolation (`onListenerError`) apply
   * automatically.
   */
  emitTreeChanged(event: TreeChangedEvent): void {
    this.#emitter.emit(TREE_CHANGED, event);
  }

  /**
   * True while a `TREE_CHANGED` event is being dispatched synchronously.
   * Delegates to the emitter's own in-flight tracking (#1034) — `getRoutesApi`
   * reads this to reject reentrant route-CRUD from a `subscribeChanges` handler
   * (#1032).
   */
  isEmittingTreeChanged(): boolean {
    return this.#emitter.isDispatching(TREE_CHANGED);
  }

  /**
   * Subscribes to `TREE_CHANGED`. **Lenient** duplicate semantics (mirrors
   * {@link subscribe}): each call wraps the handler in a fresh closure, so N
   * registrations of the same reference produce N independent subscriptions.
   */
  subscribeTreeChanged(
    handler: (event: TreeChangedEvent) => void,
  ): Unsubscribe {
    // Same disposed-state enforcement as subscribe()/subscribeLeave() (#946),
    // completing the guard across all three subscription primitives — extended
    // here to the internal route-tree channel (#982). A `subscribeChanges`
    // reference bound before dispose() (`const s = routes.subscribeChanges
    // .bind(routes)`) reaches this method via the getRoutesApi delegate, which
    // — unlike its add/remove/update siblings — does not itself check
    // isDisposed(). Without this guard, `emitter.on` would re-register a
    // TREE_CHANGED listener that can never fire (clearAll already ran, the FSM
    // is DISPOSED, the route tree is torn down, no future emit) — a silent
    // no-op, the internal-channel counterpart of the #946 hazard.
    if (this.isDisposed()) {
      throw new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    return this.#emitter.on(TREE_CHANGED, (event: TreeChangedEvent) => {
      handler(event);
    });
  }

  /** Number of active `TREE_CHANGED` listeners (drives conditional emit). */
  treeChangedListenerCount(): number {
    return this.#emitter.listenerCount(TREE_CHANGED);
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
    // Table-driven: the FSM action emits TRANSITION_START (#1169 D-full). A
    // NAVIGATE that the table rejects is a no-op — the FSM never leaves an
    // invalid state and no event fires.
    this.#fsm.send(routerEvents.NAVIGATE, { toState, fromState });
  }

  sendComplete(
    state: State,
    fromState?: State,
    opts: NavigationOptions = {},
  ): void {
    // Table-driven: the FSM action emits TRANSITION_SUCCESS (#1169 D-full).
    // COMPLETE from IDLE/DISPOSED (a listener stopped/disposed mid-transition)
    // is a table no-op — no resurrection, no phantom success emit.
    this.#fsm.send(routerEvents.COMPLETE, { toState: state, fromState, opts });

    // Nav committed — clear so a later stop()/dispose() cannot cancel a finished
    // navigation. Unconditional now that synchronous reentrant navigate is banned
    // (RFC §4): nothing can replace #currentToState during the emit above, so the
    // #308 reentrant-preserve guard is no longer needed.
    this.#currentToState = undefined;
  }

  sendLeaveApprove(toState: State, fromState?: State): void {
    // Table-driven: the FSM action emits TRANSITION_LEAVE_APPROVE (#1169 D-full).
    // LEAVE_APPROVE from IDLE/DISPOSED is a table no-op — no resurrection.
    this.#fsm.send(routerEvents.LEAVE_APPROVE, { toState, fromState });
  }

  sendFail(toState?: State, fromState?: State, error?: unknown): void {
    this.#pendingToState = toState;
    this.#pendingFromState = fromState;
    this.#pendingError = error;
    this.#fsm.send(routerEvents.FAIL);

    // Nav failed — clear (unconditional; synchronous reentrant navigate is
    // banned (RFC §4), so nothing replaces #currentToState during the emit).
    this.#currentToState = undefined;
  }

  /**
   * Surfaces a `TRANSITION_ERROR` for callers that do **not** know — or do not
   * control — the current FSM state: the plugin-facing `emitTransitionError`
   * primitive (`getPluginApi`), the dispose chain, and validator / same-state
   * rejections. It is the state-agnostic counterpart to {@link sendFail}.
   *
   * **What "Safe" means here.** The error event is never *dropped*, whatever the
   * FSM state — it does **not** mean the method catches every error. Errors
   * thrown *inside* a `TRANSITION_ERROR` listener are isolated by the
   * `EventEmitter`'s per-listener `onListenerError` sink, not by this method.
   *
   * **Why it branches on its own FSM state.** When the FSM is settled in `READY`
   * (no transition in flight) it routes through the FSM `FAIL` action via
   * {@link sendFail}, so the error rides the normal FSM-driven emit. Otherwise —
   * the router may be starting, mid-transition, or torn down — it emits
   * `TRANSITION_ERROR` directly: a fire-and-forget error report from an unknown
   * state must not drive a second FSM transition that could collide with an
   * in-flight one. Both branches guarantee the event reaches subscribers.
   */
  sendFailSafe(toState?: State, fromState?: State, error?: unknown): void {
    if (this.isReady()) {
      this.sendFail(toState, fromState, error);
    } else {
      this.emitTransitionError(toState, fromState, error as RouterError);
    }
  }

  sendCancel(toState: State, fromState?: State, reason?: unknown): void {
    this.#pendingToState = toState;
    this.#pendingFromState = fromState;
    this.#pendingCancelReason = reason;
    this.#fsm.send(routerEvents.CANCEL);

    // Nav cancelled — clear (unconditional; synchronous reentrant navigate is
    // banned (RFC §4), so nothing replaces #currentToState during the emit).
    this.#currentToState = undefined;
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

  isStarting(): boolean {
    return this.#fsm.getState() === routerStates.STARTING;
  }

  isIdle(): boolean {
    return this.#fsm.getState() === routerStates.IDLE;
  }

  /**
   * Plugin-author API for subscribing to internal router events.
   *
   * @remarks
   *
   * **Duplicate-registration semantics — strict (throws).** Passing the same
   * callback reference twice for the same event throws
   * `Error("Duplicate listener for ...")` from the underlying `EventEmitter`.
   * This is loud-on-misuse by design: plugin code is expected to register
   * each callback once. The contract differs from {@link subscribe} /
   * {@link subscribeLeave}, which are end-user surfaces and silently accept
   * duplicates.
   */
  addEventListener<E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ): Unsubscribe {
    this.#checkListenerThreshold(eventName, "addEventListener");

    return this.#emitter.on(
      eventName,
      cb as (...args: RouterEventMap[typeof eventName]) => void,
    );
  }

  /**
   * End-user / UI-binding API for subscribing to successful transitions.
   *
   * @remarks
   *
   * **Duplicate-registration semantics — independent.** Each call wraps
   * `listener` in a fresh closure and registers it as a distinct internal
   * slot. `router.subscribe(fn)` twice produces **two** active subscriptions;
   * `fn` fires twice per `TRANSITION_SUCCESS`. The returned `Unsubscribe` is
   * paired with its specific call — invoking it removes exactly that
   * registration.
   *
   * This contract differs from {@link addEventListener} (plugin API, throws
   * on duplicate). End-user code that wants idempotent registration must
   * gate itself, e.g. `if (!unsub) unsub = router.subscribe(fn);`.
   */
  subscribe(listener: SubscribeFn): Unsubscribe {
    // Enforce the disposed state HERE, not only on the facade. A reference
    // bound before dispose() (`const s = router.subscribe.bind(router)`)
    // bypasses the facade's #markDisposed swap and reaches this method
    // directly. Without this guard, `emitter.on` would silently re-register a
    // listener that can never fire (clearAll already ran, FSM is DISPOSED, no
    // future emit) — a silent no-op / stuck-UI hazard (#946).
    if (this.isDisposed()) {
      throw new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    this.#checkListenerThreshold(events.TRANSITION_SUCCESS, "subscribe");

    // `subscribe` is fire-and-forget; the listener's return value is ignored at
    // the type level (`SubscribeFn` is `=> void`). A void-typed async listener
    // still returns a rejecting Promise at runtime, so return it to the emitter,
    // whose central isolation routes the rejection to the same `onListenerError`
    // sink a sync throw flows through — instead of leaking an `unhandledRejection`
    // (fatal under `--unhandled-rejections=strict`, the Node 22+ default). This
    // is #944, now folded into the emitter's central #1412 async isolation — the
    // former per-site `.catch` here is redundant (symmetric with `subscribeLeave`,
    // which isolates via `Promise.allSettled`).
    return this.#emitter.on(
      events.TRANSITION_SUCCESS,
      (toState: State, fromState?: State) => {
        // Return the listener's runtime value to the emitter so its central
        // isolation catches an async listener's rejection (#944/#1412). Read the
        // void-typed result into `unknown` first — a returned `void` expression
        // is forbidden, but returning the read `unknown` is fine.
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- read the void-typed listener's runtime value so it can be returned for central async isolation (#944/#1412)
        const result: unknown = listener({
          route: toState,
          previousRoute: fromState,
        });

        return result;
      },
    );
  }

  /**
   * End-user / UI-binding API for subscribing to **approved** route departures
   * (`LEAVE_APPROVED` phase): all `canDeactivate` guards have passed, but the
   * departure is **tentative, not committed** — an activation (`canActivate`)
   * guard can still reject (or the target route be removed mid-transition),
   * leaving the user on the current route (#932). Treat the leave as tentative
   * for non-idempotent side-effects and use the payload `signal` (which aborts
   * with the failure reason, #943) to roll back when the navigation does not
   * commit. Async listeners block the activation phase.
   *
   * @remarks
   *
   * **Duplicate-registration semantics — independent.** Each call pushes
   * `listener` onto the internal array; `router.subscribeLeave(fn)` twice
   * produces two entries and `fn` fires twice per leave. Each returned
   * `Unsubscribe` is **idempotent** (a `removed` flag, #1349) and removes
   * exactly ONE entry — the first still matching the reference (`indexOf`
   * semantic). So a repeated call of one unsubscribe is a true no-op and does
   * **not** touch the other registration; N subscribes + M *distinct*
   * unsubscribes leave N − M entries. Which physical entry survives is
   * irrelevant — the reference is the same.
   *
   * Contract differs from {@link addEventListener} (throws on duplicate).
   * For idempotent *registration* (one active subscription), gate at the call site.
   */
  subscribeLeave(listener: LeaveFn): Unsubscribe {
    // Same disposed-state enforcement as subscribe() (#946): a pre-bound
    // reference would otherwise push onto #leaveListeners after dispose() and
    // silently never fire (FSM is DISPOSED, no LEAVE_APPROVE emit).
    if (this.isDisposed()) {
      throw new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    this.#leaveListeners.push(listener);

    // Idempotency flag (#1349), mirroring extendRouter / addInterceptor (#1198).
    // Without it, a double call would `indexOf(listener)` again and splice a
    // DUPLICATE registration of the same fn — silently deactivating another
    // subscriber whose own unsubscribe was never called. The `Unsubscribe`
    // contract names subscribeLeave as idempotent. (Unlike addInterceptor, the
    // `idx !== -1` guard stays: `dispose()` empties `#leaveListeners` via
    // `clearAll`, so an unsubscribe called after dispose reaches this with
    // idx === -1.)
    let removed = false;

    return () => {
      if (removed) {
        return;
      }

      removed = true;

      const idx = this.#leaveListeners.indexOf(listener);

      if (idx !== -1) {
        this.#leaveListeners.splice(idx, 1);
      }
    };
  }

  hasLeaveListeners(): boolean {
    return this.#leaveListeners.length > 0;
  }

  /**
   * True when a plugin listener runs in a PRE-COMMIT transition window where a
   * synchronous `stop()`/`dispose()` can supersede the in-flight navigation
   * before it commits — i.e. `onTransitionStart` (TRANSITION_START) or
   * `onTransitionLeaveApprove` (TRANSITION_LEAVE_APPROVE). (`subscribeLeave` is
   * tracked separately via `hasLeaveListeners`; `onTransitionSuccess` fires
   * post-commit and cannot cancel.) Read into the pre-`startTransition` liveness
   * snapshot so the commit-gate (#1169) fires for these windows too.
   */
  hasPreCommitListeners(): boolean {
    return (
      this.#emitter.listenerCount(events.TRANSITION_START) > 0 ||
      this.#emitter.listenerCount(events.TRANSITION_LEAVE_APPROVE) > 0
    );
  }

  awaitLeaveListeners(
    toState: State,
    fromState: State | undefined,
    signal: AbortSignal,
  ): Promise<void> | undefined {
    if (fromState === undefined) {
      return undefined;
    }

    // Freeze the payload wrapper so listeners cannot mutate it (`payload.route`
    // is already deep-frozen via the State immutability invariant; this closes
    // the wrapper-mutation gap surfaced by audit `probe-05-payload-frozen`).
    const leaveState: LeaveState = Object.freeze({
      route: fromState,
      nextRoute: toState,
      signal,
    });

    let promises: Promise<void>[] | undefined;
    let firstSyncError: unknown;

    // Snapshot before iteration — a listener that reentrantly calls
    // `subscribeLeave(newFn)` or its own `unsubscribe()` must not affect the
    // current emit cycle. Symmetric with the EventEmitter snapshot invariant
    // (PR #666 / #659).
    const snapshot = [...this.#leaveListeners];

    // Elevated across the SYNC leave-listener dispatch: `isProcessing()` reads
    // it, so a sync subscribeLeave listener that calls navigate() is rejected
    // with REENTRANT_NAVIGATION at the facade (RFC §4). The `finally` restores it
    // before any async tail (returned promise) runs, so a DEFERRED navigate from
    // an async listener (after its first `await`) sees depth 0 and is allowed.
    this.#dispatchDepth++;

    try {
      for (const listener of snapshot) {
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
    } finally {
      this.#dispatchDepth--;
    }

    if (promises === undefined) {
      if (firstSyncError !== undefined) {
        throw ensureError(firstSyncError);
      }

      return undefined;
    }

    return settleLeavePromises(promises, firstSyncError, signal);
  }

  clearAll(): void {
    this.#emitter.clearAll();
    this.#leaveListeners.length = 0;
  }

  setLimits(limits: { maxListeners: number; warnListeners: number }): void {
    this.#emitter.setLimits(limits);
  }

  /**
   * Injects the lazy validator accessor (wireNamespaces), mirroring
   * `PluginsNamespace` / `RouteLifecycleNamespace`. The closure reads the live
   * `RouterInternals.validator`, so a validation-plugin registered AFTER wiring
   * is still observed on the next `subscribe` / `addEventListener`.
   */
  setValidatorAccessor(getValidator: () => RouterValidator | null): void {
    this.#getValidator = getValidator;
  }

  // Single guarded entry point for routing a cancel into the FSM `CANCEL` action
  // — used by every source: stop/dispose (RouterLifecycle) pass no reason;
  // supersede / external `opts.signal` (via the wiring `cancelNavigation` dep)
  // pass the abort reason (#943). `canCancel()` makes it a no-op outside a
  // cancellable FSM state (#1034: was a second, unguarded `cancelNavigation` path).
  sendCancelIfPossible(fromState: State | undefined, reason?: unknown): void {
    const toState = this.#currentToState;

    if (!this.canCancel() || toState === undefined) {
      return;
    }

    this.sendCancel(toState, fromState, reason);
  }

  /**
   * Proactive listener-count threshold (#1188) — mirrors the plugins /
   * lifecycle / dependencies counters. Opt-in: the emitter's per-event count is
   * read ONLY when the validator is installed, so the bare-core hot path pays
   * nothing. `count` is the POST-add size (`listenerCount + 1`), matching
   * `RouteLifecycleNamespace`'s `count + 1`, so warn/error fire exactly when the
   * new listener reaches the threshold. Core keeps the emitter's bare-`Error`
   * hard cap; this only surfaces an actionable signal well before it.
   */
  #checkListenerThreshold(eventName: EventName, methodName: string): void {
    const validator = this.#getValidator?.();

    if (validator) {
      validator.eventBus.validateCountThresholds(
        this.#emitter.listenerCount(eventName) + 1,
        eventName,
        methodName,
      );
    }
  }

  #emitPendingError(): void {
    this.emitTransitionError(
      this.#pendingToState,
      this.#pendingFromState,
      this.#pendingError as RouterError | undefined,
    );

    // Clear the pending payload once this FAIL action has consumed it. `#pending*`
    // is only meaningful in the window between the sendFail()/sendFailSafe() that
    // sets it and this emit; keeping it afterwards pins a stale State/RouterError
    // on the instance and leaves an implicit "valid only in this window" coupling
    // (#949). Hygiene only — every consumer overwrites the fields before
    // re-reading (handleCancel reads what its own sendCancel just set), so there
    // is no observable behaviour change.
    this.#pendingToState = undefined;
    this.#pendingFromState = undefined;
    this.#pendingError = undefined;
  }

  #setupFSMActions(): void {
    const fsm = this.#fsm;

    fsm.on(routerStates.STARTING, routerEvents.STARTED, () => {
      this.emitRouterStart();
    });

    fsm.on(routerStates.READY, routerEvents.STOP, () => {
      this.emitRouterStop();
    });

    // NAVIGATE / LEAVE_APPROVE / COMPLETE emit their transition event as the FSM
    // action (payload = the transition states), so `send()` from an invalid
    // state (e.g. COMPLETE from IDLE after a listener's stop()/dispose()) is a
    // table no-op that emits nothing — the FSM table is the sole authority over
    // state, no `forceState` resurrection (#1169 D-full). NAVIGATE fires from
    // READY plus the TRANSITION_STARTED / LEAVE_APPROVED self-loops (supersede).
    const emitNavigate = (payload: RouterPayloads["NAVIGATE"]): void => {
      this.emitTransitionStart(payload.toState, payload.fromState);
    };

    fsm.on(routerStates.READY, routerEvents.NAVIGATE, emitNavigate);
    fsm.on(
      routerStates.TRANSITION_STARTED,
      routerEvents.NAVIGATE,
      emitNavigate,
    );
    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.NAVIGATE, emitNavigate);

    fsm.on(
      routerStates.TRANSITION_STARTED,
      routerEvents.LEAVE_APPROVE,
      (payload) => {
        this.emitTransitionLeaveApprove(payload.toState, payload.fromState);
      },
    );

    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.COMPLETE, (payload) => {
      this.emitTransitionSuccess(
        payload.toState,
        payload.fromState,
        payload.opts,
      );
    });

    const handleCancel = () => {
      const toState = this.#pendingToState;
      const reason = this.#pendingCancelReason;

      this.#pendingCancelReason = undefined;

      // (RFC navigation-cancellation-unification §5): the FSM CANCEL
      // action OWNS the abort. Aborting the in-flight controller wakes the parked
      // async pipeline (#1018) and rejects navigate() — the post-race local
      // isActive() sees signal.aborted; `reason` surfaces as the leave signal's
      // reason (#943). Order: (i) abort (wake) then (ii) emit TRANSITION_CANCEL.
      // No cycle: onInternalAbort is wake-only, it does not re-enter cancel.
      this.#abortController(reason);

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
