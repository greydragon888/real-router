// packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts

import { SCOPE_DECIDED_TOKEN } from "./types";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  errorCodes,
  events,
} from "../../constants";
import { adoptForeignBag } from "../../helpers";
import { RouterError, freezeThrownError } from "../../RouterError";
import { routerEvents, routerStates } from "../../routerFSM";

import type { EventBusOptions, ScopeDecision } from "./types";
import type {
  RouterEvent,
  RouterFSMContext,
  RouterPayloads,
  RouterState,
} from "../../routerFSM";
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
  EventMethodMap,
  Params,
  SearchParams,
  TransitionMeta,
} from "../../types";
import type { RouterEventMap } from "../../types/internal";
import type { RouterValidator } from "../../types/RouterValidator";
import type { EventEmitter } from "../../utils/event-emitter";
import type { FSM } from "../../utils/fsm";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

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

/**
 * Register the bridge onto the caller's signal and hand back the closer that
 * undoes it — the registration is the ONLY way to obtain one.
 *
 * ⚑ **That is the whole point, and it replaces an ordering rule with a shape
 * (#1724).** Left in the caller, the two statements — `addEventListener`
 * first, the closer recorded second — depend on an order that is not obvious
 * — `signal` belongs to the APPLICATION, so registering is a call into
 * code the router does not own, and `FSM.send` runs an edge's action with no
 * `try`/`catch`. A closer recorded FIRST outlives a throwing registration and
 * stands on the plan the edge's `update` has already published as
 * `ctx.inflight`; the next terminal edge calls it, `removeEventListener` fails
 * the same way, and the throw lands inside `handleCancel` above
 * `emitTransitionCancel`. Measured on the `{ signal: controller }` slip (the
 * controller passed where its `.signal` belongs): the FOLLOWING navigation dies
 * with a code-less `TypeError`, no event of any kind is emitted, and the
 * committed state does not move.
 *
 * Written this way there is nothing to order: the closer does not exist until
 * the registration has returned it, so a throw leaves the caller with nothing to
 * record. Getting it wrong is not a matter of care any more — it needs a second
 * closer written by hand, which is a rewrite rather than a swapped pair of
 * lines.
 *
 * `onClosed` keeps the self-clearing half OUT of this function: the field lives
 * on the plan, and taking the plan as a parameter would put the same ordering
 * question back inside here, where no shape guards it. So the caller passes what
 * to forget, and this function decides only WHEN (#1716 — one closing protocol,
 * three terminal edges, no coordination between them).
 */
function bridgeSignal(
  signal: AbortSignal,
  onAbort: () => void,
  onClosed: () => void,
): () => void {
  // Stryker disable next-line ObjectLiteral: equivalent — `{ once: true }` is redundant, and for a reason that OUTLIVED the router-level slot: `abort` fires at most once per signal (the DOM abort algorithm returns early when `aborted` is already true), and this listener is explicitly removed on all four settle paths. It is NOT equivalent because the signal is discarded — it belongs to the CALLER and is not (#1684).
  signal.addEventListener("abort", onAbort, {
    // Stryker disable next-line BooleanLiteral: equivalent — `once` redundant, same argument as the ObjectLiteral above.
    once: true,
  });

  return () => {
    onClosed();
    signal.removeEventListener("abort", onAbort);
  };
}

export class EventBusNamespace {
  readonly #fsm: FSM<
    RouterState,
    RouterEvent,
    RouterFSMContext,
    RouterPayloads
  >;
  readonly #emitter: EventEmitter<RouterEventMap>;
  // Lazy accessor for the opt-in RouterValidator (wired by wireNamespaces).
  // Returns `null` until validation-plugin is registered — so the proactive
  // listener-count threshold (#1188) costs the no-plugin path nothing.
  #getValidator: (() => RouterValidator | null) | undefined;
  readonly #leaveListeners: LeaveFn[] = [];

  // Depth of the synchronous router-dispatch window — elevated while a
  // transition event is being emitted (`emitTransition*`), while `$start` is
  // being emitted (#1647) or while a `subscribeLeave`
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

  constructor(options: EventBusOptions) {
    this.#fsm = options.routerFSM;
    this.#emitter = options.emitter;
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

  /**
   * ⚑ Elevated like the five `emitTransition*` below, and NOT like
   * `emitRouterStop` beside it (#1647). `completeStart()` sends STARTED —
   * leaving STARTING for READY — BEFORE the boot navigation commits, so every
   * `onStart` hook runs on a READY machine that still owes a commit, where
   * `NAVIGATE` IS declared: a listener's navigation ran to completion, announced
   * `TRANSITION_SUCCESS`, and was then overwritten by the boot.
   *
   * The boot is unaffected: `completeStart()` returns before `navigateToState`
   * runs, so the counter is back to zero by the time it navigates.
   */
  emitRouterStart(): void {
    this.#dispatchDepth++;
    try {
      this.#emitter.emit(events.ROUTER_START);
    } finally {
      this.#dispatchDepth--;
    }
  }

  emitRouterStop(): void {
    this.#emitter.emit(events.ROUTER_STOP);
  }

  /**
   * ⚑ **The third parameter is a compile-time obligation, unread at runtime
   * (#1724).** It is the proof that the cancellability scope was decided BEFORE
   * this announce — see `ScopeDecision` in `./types`. The announce is the moment
   * a plugin's `onTransitionStart` runs, so a bridge registered after it misses
   * exactly the aborts it exists for, and misses them SILENTLY. The `const`
   * holding the proof cannot be read above its own declaration, so the wrong
   * order is `TS2448` rather than a test that has to notice a listener that was
   * never called.
   */
  emitTransitionStart(
    toState: State,
    fromState: State | undefined,
    _scope: ScopeDecision,
  ): void {
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
   * True while a router event is being dispatched synchronously — an
   * `emitTransition*` call, the `$start` emit (#1647), or a `subscribeLeave`
   * listener batch is on the stack. The navigation facade reads this to reject a
   * synchronous reentrant navigate() from inside such a listener (RFC §4).
   *
   * `$stop` is deliberately NOT in that set: its action runs after the swap, so
   * the machine is already IDLE and the doors refuse `ROUTER_NOT_STARTED` from
   * the table anyway — a second mechanism there would buy nothing (#1647 §5.6a).
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
      throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
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

  /**
   * Announce a navigation to the table, handing it the PLAN as the payload so
   * the machine adopts it as the navigation it is carrying (#1648).
   *
   * @returns whether the NAVIGATE edge actually fired. The edge is declared on
   * READY / TRANSITION_STARTED / LEAVE_APPROVED only, so a `false` here means
   * the machine had already left the band — see `beginTransition`, the one
   * caller that acts on it.
   */
  sendNavigate(payload: RouterPayloads["NAVIGATE"]): boolean {
    // Table-driven: the FSM action emits TRANSITION_START (#1169 D-full). A
    // NAVIGATE that the table rejects is a no-op — the FSM never leaves an
    // invalid state and no event fires.
    return (
      this.#fsm.send(routerEvents.NAVIGATE, payload) ===
      routerStates.TRANSITION_STARTED
    );
  }

  /**
   * ask-half of the commit protocol (RFC-10a §7.4). Reads the SAME table row
   * `sendComplete` fires, in the same synchronous window, with only
   * `clearCanDeactivate` between them — which runs no application code (#1649).
   *
   * ⚠ Both calls evaluate the edge's `when`, so that window is a claim about
   * the PREDICATE too: see `mayCommit` in `routerFSM`, which owns the rule and
   * the measurement.
   */
  canCommitTransition(payload: RouterPayloads["COMPLETE"]): boolean {
    return this.#fsm.canSend(routerEvents.COMPLETE, payload);
  }

  sendComplete(payload: RouterPayloads["COMPLETE"]): void {
    // Table-driven: the FSM action emits TRANSITION_SUCCESS (#1169 D-full).
    // COMPLETE from IDLE/DISPOSED (a listener stopped/disposed mid-transition)
    // is a table no-op — no resurrection, no phantom success emit.
    this.#fsm.send(routerEvents.COMPLETE, payload);
  }

  sendLeaveApprove(payload: RouterPayloads["LEAVE_APPROVE"]): void {
    // Table-driven: the FSM action emits TRANSITION_LEAVE_APPROVE (#1169 D-full).
    // LEAVE_APPROVE from IDLE/DISPOSED is a table no-op — no resurrection.
    // Carries no epoch since #1670: the edge is unconditional, so there was no
    // reader left for one.
    this.#fsm.send(routerEvents.LEAVE_APPROVE, payload);
  }

  sendFail(fromState?: State, error?: unknown, nav?: object): void {
    this.#fsm.send(routerEvents.FAIL, { nav, fromState, error });
  }

  sendCancel(fromState?: State, reason?: unknown): void {
    this.#fsm.send(routerEvents.CANCEL, { fromState, reason });
  }

  /**
   * Commit a state that is NOT the product of a navigation — the 404 bypass and
   * `replace()`'s revalidation. The write and the announce both happen inside
   * the FSM `SYSTEM_COMMIT` action, so neither escapes the table.
   *
   * ask and fire live HERE, one above the other, deliberately: the table
   * refuses SILENTLY (a `send` from a state without an edge is a no-op), so a
   * caller that only fired would skip the commit and nobody would hear about
   * it. Asking first turns that into the `ROUTER_DISPOSED` these callers were
   * already promised (#1186) — the guard did not disappear when it became
   * structural, it moved to where it cannot be forgotten.
   */
  systemCommit(payload: RouterPayloads["SYSTEM_COMMIT"]): State {
    // ⚑ The fourth commit door, and the one that copied nothing (#1792).
    // `getInternals` is a published export and four first-party packages use
    // it (the fourth through `shared/ssr`, symlinked into two of them), so `toState` can be a State someone else BUILT — while the FSM
    // commits by freezing the SHELL only, which left both channels as the
    // caller's own writable objects, reachable through the handle it kept.
    //
    // Copied HERE rather than in the wiring that calls this, because a state
    // literal built in the wiring layer is a door in disguise and would inherit
    // the plumbing exclusion `commit-door-authority-1753` grants — its own
    // comment says so, and it reds when that line is crossed. Not in
    // `commitState` either: the ordinary transition lands there too and must
    // stay allocation-free.
    const { toState } = payload;
    // ⚑ RETURNED, not just sent (#1792). The copy above means the caller's
    // argument stops being the object the router holds, and `navigateToNotFound`
    // hands its own argument back to application code — so without this it
    // returns a state the router never committed, value-equal and not `===`
    // `getState()`. The FSM freezes this object in place, so what comes back
    // here is the committed one, identity and all.
    // `as State` for the same reason `materialize` needs it: the conditional
    // spread below makes `transition` optional to the compiler, while `State`
    // declares it required. A foreign State that arrives without one is already
    // outside the type — this preserves that shape rather than inventing a value
    // for it.
    const committed = {
      // ⚑ Field by field, NOT `{ ...toState }` (#1792). A spread DEFINES, which
      // is the whole reason a spread is dangerous for this one name: a foreign
      // State carrying an own `__proto__` handed it straight onto the committed
      // shell, where `Object.assign(x, getState())` swapped `x`'s prototype and
      // `JSON.stringify` carried the key into the SSR payload. The channels were
      // clean the whole time — the SHELL was not, and it is the same object.
      // `navigateToState` has always built its shell this way; this door now
      // agrees with it, and a foreign state's extra fields stop riding along.
      // ⚑ Field order matches every other producer's (`makeState`, `matchPath`,
      // the pipeline). Not cosmetic: `Object.keys(getState())` is observable,
      // and a differently-ordered literal gives the committed state a second
      // hidden class — the shape #1684's regression took.
      name: toState.name,
      params: adoptForeignBag(toState.params, EMPTY_PARAMS) as Params,
      search: adoptForeignBag(toState.search, EMPTY_SEARCH) as SearchParams,
      path: toState.path,
      // ⚑ THREE channels, not two — the same set `navigateToState` copies. The
      // spread this literal replaced carried `context` by reference, which left the committed
      // `state.context` writable through the handle the caller kept: exactly the
      // defect named for the other two, surviving in the third because a spread
      // looks like a copy. `context` is the documented mutable carve-out
      // (INVARIANTS "State immutability" row 2) — so what is fixed here is
      // OWNERSHIP, not mutability: the committed context is core's object, and
      // plugins keep writing to it through `claim.write(getState(), …)` exactly
      // as before. A spread DEFINES, so a namespace claimed under the name
      // `__proto__` survives the copy (#1191 / #1788), which is the contract
      // `context` has and the state channels deliberately do not.
      context: { ...toState.context },
      // ⚑ The FOURTH field that needed it, for the same reason as the other
      // three (#1792). Carried by reference it stayed the caller's object and
      // unfrozen: `getState().transition.phase` could be rewritten after the
      // commit, `Object.assign(x, getState())` swapped `x`'s prototype through
      // it, and `JSON.stringify` carried an own `__proto__` on it. Its nested
      // `segments` is frozen by `buildTransitionMeta`; this owns the level the
      // shell owns.
      // ⚠ NOT a spread. A spread DEFINES, so `{ ...transition }` re-creates an
      // own `__proto__` on the copy — the very idiom this file replaced for the
      // shell three lines up. The guarded copier is the same one the channels
      // use, and `segments` rides through it already frozen by
      // `buildTransitionMeta`.
      //
      // ⚠ And it is SPREAD IN, not written unconditionally. Written flat, a
      // foreign State with no `transition` committed the adoption's empty
      // answer — the shared `EMPTY_PARAMS` singleton, cast to a type that
      // declares `phase`, `reason` and `segments` as required. The committed
      // state then lied about its own shape and `getState().transition` was the
      // same object as some other state's `getState().params`. Absence stays
      // absence.
      // ⚠ `materialize` is NOT a precedent for this shape: since #1976 the
      // pipeline attaches `transition` at construction on both its terminals.
      // This door is the ONE core State
      // constructor that still spreads the field conditionally, and it is the
      // only one that should — `getInternals` is published, so `toState` here
      // is a State someone ELSE built, and the runtime is the only witness of
      // what it actually contains. Three of the other five ATTACH a value core
      // owns — `pipeline/materialize`'s shared builder, `#copyChannels`,
      // `navigateToNotFound`; the last two (`getRoutesApi`'s revalidation pair)
      // COPY whatever the committed state had, absence included, so they carry
      // this door's answer forward rather than making one.
      // `state-freeze-authority` exempts this SITE, and reds on a second.
      // ⚠ The cast is the point, not noise: `State.transition` is declared
      // REQUIRED, so by the TYPE this test is dead — and `getInternals` is
      // published, so `toState` may be an object some caller hand-built to that
      // type and did not fill. The door trusts the runtime, not the declaration.
      ...((toState as { transition?: TransitionMeta }).transition !==
        undefined && {
        transition: adoptForeignBag(
          toState.transition as unknown as Record<string, unknown>,
          EMPTY_PARAMS,
        ) as unknown as TransitionMeta,
      }),
    } as State;

    // ⚑ ASKED HERE, below the copy, so that nothing runs between the ask and
    // the send. Above it the copy sat in the gap — and the copy READS every
    // value of four caller-supplied slots, which is a call into application
    // code. An accessor that called `stop()` or `dispose()` from there left the
    // ask already answered and the `send` a silent no-op, so this method
    // returned a fully-formed State that was never committed, with no throw.
    // That is exactly the outcome `internals.ts` says this throw exists to
    // prevent (#1186): "a refusal there is silent … the contract these callers
    // already had promises an error, not a quietly skipped commit."
    if (!this.#fsm.canSend(routerEvents.SYSTEM_COMMIT)) {
      throw this.#refuseSystemCommit();
    }

    this.#fsm.send(routerEvents.SYSTEM_COMMIT, {
      ...payload,
      toState: committed,
    });

    return committed;
  }

  /**
   * ⚑ **What this ask is, and what it is NOT (#1696).** It answers one
   * question — *is `NAVIGATE` declared from where the machine is standing?* — so
   * its refusal states the router's STATE, which the caller turns into
   * `ROUTER_NOT_STARTED` (or the boot-window sentence, #1647); the sibling asks
   * (`canStart`, `systemCommit`, `canCancel`) work the same way.
   *
   * A table CONDITION refuses on that same wire and inherits whichever of those
   * sentences the call site throws — and it is asked here with **no payload**,
   * so what a `when` answers depends on the predicate (engine INVARIANT 4).
   * Adding one to an asked edge therefore means choosing what its refusal
   * reports: `refusal-code-authority-1696.test.ts` holds that closed set and
   * carries the measurements for both shapes.
   */
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
      throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
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
      throw freezeThrownError(new RouterError(errorCodes.ROUTER_DISPOSED));
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
    const leaveState: LeaveState = freeze({
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

  // Single entry point for routing a cancel into the FSM `CANCEL` action — every
  // source comes through here: stop/dispose pass no reason, supersede and the
  // external `opts.signal` pass the abort reason (#943).
  //
  // The `canCancel()` ask is not a safety net — a `send` with no edge is a
  // silent no-op, and removing the ask reds nothing at 100 % coverage. It states
  // the intent at the one place every source passes, and it skips the payload
  // literal for the cancels that arrive out of band.
  //
  // ⚑ No TARGET is passed (#1671): `sendCancel` takes `fromState` for the event
  // it announces, and the navigation being cancelled is read by the action off
  // `ctx.inflight`, on an edge that only exists in-band. The `|| toState ===
  // undefined` clause that stood here was type narrowing for the older
  // signature, semantically dead on the band invariant (#1669: 202 asks, 0
  // refusals, with the clause and without).
  sendCancelIfPossible(fromState: State | undefined, reason?: unknown): void {
    if (!this.canCancel()) {
      return;
    }

    this.sendCancel(fromState, reason);
  }

  /**
   * Route an external `opts.signal` abort onto FSM `CANCEL`, for the WHOLE life
   * of the navigation (#1684) — the ONE implementation, called from two moments
   * (#1724).
   *
   * Registered for the WHOLE life of the navigation because a bridge that only
   * covers the parked arc leaves every synchronous abort unheard by the machine:
   * the navigation rejects correctly and the band stays in `LEAVE_APPROVED`,
   * with `isLeaveApproved()` lying and route-CRUD silently blocked (#1684).
   *
   * ⚑ **It lives HERE, and not in the pipeline, because the SCOPE belongs to the
   * band (#1716 / #1724).** The machine already owns closing it — the `CANCEL` /
   * `FAIL` / `COMPLETE` actions — so opening it from the `NAVIGATE` action is
   * what makes the lifetime symmetric, and it is what removes the pipeline's
   * last say in that lifetime. Registering a listener is an EFFECT, so the
   * action is its layer (RFC-10a §6.2: bookkeeping in `update`, effects in the
   * action), and writing `payload.detachExternalBridge` from here is the same
   * class as `handleCancel` writing `inflight.cancelReason`.
   *
   * ⚑ **Two callers, one owner of "is a bridge already standing?" — and the
   * single owner is load-bearing rather than tidy.** The two moments exist
   * because `hasGuards` is not knowable at the announce (`planPhases` runs after
   * `startTransition`, since a `TRANSITION_START` listener may still register a
   * guard), so the pipeline still asks for the late one through
   * `NavigationDependencies.bridgeExternalSignal`. While BOTH the caller and
   * this function tested the flag, the early-return below was structurally
   * unreachable and coverage fell to 99.95 % pointing straight at it. With one
   * owner the same branch is taken by the ordinary arc that reaches both moments
   * — a pre-commit listener AND a guard — and a second registration would ORPHAN
   * the first, leaking a listener on the caller's own controller.
   *
   * `fromState` comes off the machine's own context rather than from the
   * wiring.
   */
  bridgeExternalSignal(payload: RouterPayloads["NAVIGATE"]): ScopeDecision {
    const signal = payload.externalSignal;

    if (signal === undefined || payload.detachExternalBridge !== undefined) {
      return SCOPE_DECIDED_TOKEN;
    }

    const onExternalAbort = (): void => {
      // No direct `controller.abort()` here — "FSM CANCEL ⟹ controller aborted"
      // lives in one place (`handleCancel`), which also returns the machine to
      // READY and emits `TRANSITION_CANCEL`, atomically (#1030). `reason`
      // surfaces via the leave signal (#943).
      this.sendCancelIfPossible(this.#fsm.getContext().current, signal.reason);
    };

    // ⚑ ONE expression, and that is what holds "register, THEN record": the
    // closer is the registration's RETURN VALUE, so no moment exists at which a
    // closer stands and the listener does not (`bridgeSignal` above has what
    // the two-statement form cost). The `onClosed` argument is the self-clearing
    // half, written here because this caller owns the field. Pinned by
    // `bridge-registration-order-1724.test.ts`, which COUNTS
    // `removeEventListener` — the balance discriminates, the outcome does not.
    payload.detachExternalBridge = bridgeSignal(signal, onExternalAbort, () => {
      payload.detachExternalBridge = undefined;
    });

    return SCOPE_DECIDED_TOKEN;
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

  /**
   * Why the table refused, said out loud (#1644).
   *
   * The gate this ask replaced (#1186) was `!isActive()`, i.e. IDLE or DISPOSED
   * — so `ROUTER_DISPOSED` was very nearly true wherever it fired. The table's
   * `canSend(SYSTEM_COMMIT)` is a different question: the edge is declared on
   * `READY` alone, so it also refuses while starting and mid-transition, on a
   * router that `isActive()` reports as live. Keeping the old code there told
   * callers the router was terminated when it was merely busy.
   *
   * Two codes, split by what the caller can DO about it: `ROUTER_DISPOSED` is
   * terminal, everything else is transient. No code in the registry says
   * "mid-transition", so the phase rides the message rather than growing the
   * public `errorCodes` surface for one internal refusal.
   *
   * ⚑ The BOOT window is a third phase (#1647), and `isStarting()` is the whole
   * distinction — an ordinary never-started router keeps the plain sentence.
   * Named here, where the phase is already known, rather than by a predicate one
   * layer up that would repeat this ask's own refusal with a worse message.
   */
  #refuseSystemCommit(): RouterError {
    if (this.isDisposed()) {
      return new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    let phase: string;

    if (this.isTransitioning()) {
      phase =
        "[router] cannot commit a state while a transition is in flight — the navigation in progress commits its own";
    } else if (this.isStarting()) {
      phase =
        "[router] cannot commit before the start navigation does — the boot would overwrite it; await start() first";
    } else {
      phase = "[router] cannot commit a state before the router has started";
    }

    return new RouterError(errorCodes.ROUTER_NOT_STARTED, { message: phase });
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
      // ⚑ **OPENING the cancellability scope is this edge's job (#1724).** The
      // action runs after the edge's `update` and before `emitTransitionStart`,
      // so a plugin's `onTransitionStart` is still covered — measured, the
      // bridge fires from inside the announce 4 times across the tier. And a
      // `NAVIGATE` the table REFUSES runs no action, so a born-dead navigation
      // registers nothing and has nothing to close, which is what retired the
      // pipeline's last closing site (#1688). ⚠ Note that "the edge fired" is a
      // WIDER set than "`sendNavigate` returned true": `FSM.send` reports the
      // state after the action AND the listeners, so 9 navigations of the tier
      // register here and still see `false` — for those the `CANCEL` that moved
      // the machine closes the scope on its way out.
      //
      // ⚑ Conditional, exactly as the pipeline site was (#1690): registering
      // unconditionally measured **+23…30 %** on the guard-free, listener-free
      // arc, and `bridge-only-when-the-band-can-abort-1690` plus two siblings
      // red without the condition. `externalSignal` is tested first so разрез А
      // short-circuits before two `listenerCount` reads.
      //
      // ⚑ **The order below is held by the TYPE (#1724).** `emitTransitionStart`
      // demands a `ScopeDecision`, which exists only as the result of deciding
      // the scope's fate, so announcing first is `TS2448` — a compile-time lock
      // for the same reason `CommitPermit` is one: the failure it prevents is
      // SILENT (a bridge registered below the announce misses an abort raised
      // inside it, and `addEventListener` never fires retroactively).
      // ⚠ "Decided" is not "a bridge stands": the `SCOPE_DECIDED_TOKEN` arm is
      // the decision that this navigation needs none, and разрез А takes it.
      const scope: ScopeDecision =
        payload.externalSignal !== undefined &&
        (this.hasLeaveListeners() || this.hasPreCommitListeners())
          ? this.bridgeExternalSignal(payload)
          : SCOPE_DECIDED_TOKEN;

      this.emitTransitionStart(payload.toState, payload.fromState, scope);
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
      // ⚑ Close the scope (#1716). Read off the PAYLOAD and not the context:
      // this edge's `update` (`commitNavigation`) clears `inflight` before the
      // action runs, which is exactly why `CANCEL` / `FAIL` — the two edges with
      // no `update` — read the context instead.
      payload.detachExternalBridge?.();

      // Subscribers never see the caller's `AbortSignal`: it is an input to the
      // navigation, not part of what was committed. The TABLE does see it —
      // `mayCommit` refuses a commit whose signal was aborted — through
      // `payload.externalSignal`, the snapshot taken at the entry.
      //
      // ⚑ The strip lives at the ENTRY door, not here (#1962). Here it would
      // sit in the LAST reader of `opts` and decide — with a ternary on
      // `externalSignal` — whether plugins get the application's own object or
      // a copy of it, discriminated by a signal the plugin never sees.
      // `payload.opts` is core's own frozen record on every arc, made by one
      // walk above every other read, so there is nothing to decide.
      this.emitTransitionSuccess(
        payload.toState,
        payload.fromState,
        payload.opts,
      );
    });

    const handleCancel = (payload: RouterPayloads["CANCEL"]) => {
      const { fromState, reason } = payload;
      // In-band by construction: CANCEL is declared on TRANSITION_STARTED /
      // LEAVE_APPROVED only, and `inflight` is written on entry to the
      // band and no longer cleared on the way out (#1671), so the target is
      // always here. Same shape as the wiring-guaranteed `lifecycleNamespace!`
      // in `api/` — an invariant the type system cannot carry.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-band by construction: CANCEL is declared on TRANSITION_STARTED / LEAVE_APPROVED only, and `inflight` is written on entry to the band and no longer cleared on the way out (#1671); widening `emitTransitionCancel` instead would push `undefined` into the public `onTransitionCancel` hook for a case that cannot occur
      const inflight = this.#fsm.getContext().inflight!;

      // (RFC navigation-cancellation-unification §5): the FSM CANCEL
      // action OWNS the abort. Aborting the in-flight controller wakes the parked
      // async pipeline (#1018) and rejects navigate() — the post-race local
      // isActive() sees signal.aborted; `reason` surfaces as the leave signal's
      // reason (#943). Order: (i) abort (wake) then (ii) emit TRANSITION_CANCEL.
      // No cycle: onInternalAbort is wake-only, it does not re-enter cancel.
      //
      // ⚑ Read straight off the navigation the machine is carrying (#1684).
      // Going out through an injected `abortController` effect to a
      // router-level slot in `InFlightNavigation` puts it out of reach: the
      // pipeline nulls that slot BEFORE the commit on every synchronous arc, so
      // this line finds nothing and the abort arrives AFTER the emit below,
      // inverting the order stated above. The controller is a field of
      // `ctx.inflight`, so there is no second slot to fall out of step with.
      // `?.` because allocating one is conditional (разрез А allocates none).
      const cancelReason =
        reason ?? new RouterError(errorCodes.TRANSITION_CANCELLED);

      // ⚑ RECORD first, abort second (#1706). The controller is allocated
      // lazily by whichever consumer needs a signal, so `?.` here is not "no
      // controller, nothing to do" — it is "the consumer has not opened one
      // YET", and the one it opens moments later would be born unaborted. The
      // record costs no allocation, which is what keeps разрез А and the
      // born-dead arcs at zero controllers; `openController` replays it.
      inflight.cancelReason = cancelReason;
      inflight.controller?.abort(cancelReason);

      // ⚑ Closing the cancellability scope is this edge's job now (#1716), not
      // the pipeline's. BEFORE the emit deliberately: no observer of
      // `TRANSITION_CANCEL` may find a live bridge on a navigation the machine
      // has already declared over.
      inflight.detachExternalBridge?.();

      this.emitTransitionCancel(inflight.toState, fromState);
    };

    fsm.on(routerStates.TRANSITION_STARTED, routerEvents.CANCEL, handleCancel);
    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.CANCEL, handleCancel);

    // The SYSTEM_COMMIT action does BOTH halves — the write and the announce —
    // so neither happens outside the table. It sits on ONE edge since the
    // `STARTING` one was removed; kept as a named function rather than inlined
    // so the registration reads like its `emitNavigate` / `handleCancel`
    // siblings.
    const handleSystemCommit = (
      payload: RouterPayloads["SYSTEM_COMMIT"],
    ): void => {
      // The WRITE is the edge's `update`; the action only announces. Same
      // layering as every other transition — bookkeeping in `update`, effects in
      // the action (RFC-10a §6.2).
      this.emitTransitionSuccess(
        payload.toState,
        payload.fromState,
        payload.opts,
      );
    };

    fsm.on(routerStates.READY, routerEvents.SYSTEM_COMMIT, handleSystemCommit);

    // ⚑ The FAIL action is SPLIT BY EDGE (#1671), and that split is what let
    // `toState` leave the payload. The two in-band edges report a navigation's
    // failure, so the target is the machine's own `inflight` — measured
    // identical to what the payload carried on every one of 206 in-band FAILs
    // across the functional tier. `STARTING --FAIL--> IDLE` is not a navigation
    // failure at all: it is how a thrown `start()` unwinds, both of its senders
    // pass `undefined` today, and reading the context there would name whatever
    // a previously CANCELLED navigation left behind. The table now carries that
    // distinction instead of the caller.
    //
    // ⚠ Reading the context here is only safe while EVERY sender that reaches
    // an in-band edge names its navigation — the split is by EDGE, and the edge
    // cannot tell a navigation's failure from a report that merely happened
    // during one. A `ROUTE_NOT_FOUND` sent from `RouterLifecycleNamespace.start`
    // through the table would be exactly that second thing: a `start()` resuming
    // inside the band would report the LIVE navigation's target as the thing
    // that failed, and take the band away from it. No such sender exists —
    // `#unwindFailedStart` reports instead — which keeps this line honest. See `mayFail` on what a new one would cost.
    const emitNavigationFail = (payload: RouterPayloads["FAIL"]): void => {
      const inflight = this.#fsm.getContext().inflight;

      // ⚑ Close the scope (#1716) — same position and same reasoning as the
      // `CANCEL` action above. Registered on the two IN-BAND edges only, which
      // is what makes the read safe; `STARTING --FAIL--> IDLE` has its own
      // action precisely because it is not a navigation's failure.
      inflight?.detachExternalBridge?.();

      this.emitTransitionError(
        inflight?.toState,
        payload.fromState,
        payload.error as RouterError | undefined,
      );
    };

    fsm.on(routerStates.LEAVE_APPROVED, routerEvents.FAIL, emitNavigationFail);
    fsm.on(
      routerStates.TRANSITION_STARTED,
      routerEvents.FAIL,
      emitNavigationFail,
    );

    fsm.on(routerStates.STARTING, routerEvents.FAIL, (payload) => {
      this.emitTransitionError(
        undefined,
        payload.fromState,
        payload.error as RouterError | undefined,
      );
    });
  }
}
