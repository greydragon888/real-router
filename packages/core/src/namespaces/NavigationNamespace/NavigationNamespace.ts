import {
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_ERROR,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
} from "./constants";
import { completeTransition } from "./transition/completeTransition";
import { routeTransitionError } from "./transition/errorHandling";
import { executeGuardPipeline } from "./transition/guardPhase";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  errorCodes,
  constants,
} from "../../constants";
import { RouterError } from "../../RouterError";
import { getStateMetaParams, setStateMetaParams } from "../../stateMetaStore";
import { getTransitionPath, nameToIDs } from "../../transitionPath";

import type { NavigationContext, NavigationDependencies } from "./types";
import type { TransitionPath } from "../../transitionPath";
import type {
  GuardFn,
  NavigationOptions,
  Params,
  State,
  TransitionMeta,
} from "../../types";

const FROZEN_ACTIVATED: string[] = Object.freeze([
  constants.UNKNOWN_ROUTE,
]) as unknown as string[];
const FROZEN_REPLACE_OPTS: NavigationOptions = Object.freeze({ replace: true });

function forceReplaceFromUnknown(
  opts: NavigationOptions,
  fromState: State | undefined,
): NavigationOptions {
  return fromState?.name === constants.UNKNOWN_ROUTE && !opts.replace
    ? { ...opts, replace: true }
    : opts;
}

function isSameNavigation(
  fromState: State | undefined,
  opts: NavigationOptions,
  toState: State,
): boolean {
  return (
    !!fromState &&
    !opts.reload &&
    !opts.force &&
    fromState.path === toState.path
  );
}

/**
 * Independent namespace for managing navigation.
 *
 * Handles navigate(), navigateToDefault(), navigateToNotFound(), and transition state.
 *
 * Performance: navigate() uses optimistic sync execution — guards run synchronously
 * until one returns a Promise, then switches to async. This eliminates Promise/AbortController
 * overhead for the common case (no guards or sync guards).
 */
export class NavigationNamespace {
  // Stryker disable next-line BooleanLiteral: equivalent — reset to false at the top of every navigate()/navigateToState()/navigateToDefault(), so the initializer value is never observed.
  lastSyncResolved = false;
  lastSyncRejected = false;
  #deps!: NavigationDependencies;
  #currentController: AbortController | null = null;
  #navigationId = 0;

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  navigate(
    name: string,
    params: Params,
    opts: NavigationOptions,
  ): Promise<State> {
    this.lastSyncResolved = false;
    const deps = this.#deps;

    // Fast-path sync rejections: cached error + cached Promise.reject
    // No allocations, no throw/catch overhead, facade skips .catch() suppression
    if (!deps.canNavigate()) {
      // Stryker disable next-line BooleanLiteral: equivalent — #721 optimization flag, not a correctness gate. Not flagging the cached (pre-suppressed) rejection routes the facade to the else-branch, which re-attaches a harmless .catch; no observable difference.
      this.lastSyncRejected = true;

      return CACHED_NOT_STARTED_REJECTION;
    }

    let toState: State | undefined;

    try {
      toState = deps.buildNavigateState(name, params);
    } catch (error) {
      /* v8 ignore next 3 -- @preserve: reachable only via validator-driven
         throws from buildNavigateState (validateStateBuilderArgs) — covered
         in @real-router/validation-plugin's suite, not in core. */
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided buildNavigateState
      return Promise.reject(error);
    }

    if (!toState) {
      deps.emitTransitionError(
        undefined,
        deps.getState(),
        CACHED_ROUTE_NOT_FOUND_ERROR,
      );
      // Stryker disable next-line BooleanLiteral: equivalent — #721 optimization flag (see L95): the cached rejection is suppressed by the facade else-branch regardless of the flag.
      this.lastSyncRejected = true;

      return CACHED_ROUTE_NOT_FOUND_REJECTION;
    }

    return this.#executeNavigation(toState, opts);
  }

  /**
   * Navigate to a fully-built `State` directly, skipping `buildNavigateState`
   * (forwardState + buildPath + meta lookup). Used by URL plugins after they
   * have already produced a `State` from a browser-initiated event via
   * `api.matchPath(url)` — see issue #525.
   *
   * Semantics vs. `navigate(name, params, opts)`:
   * - `forwardState` is NOT re-applied. matchPath already runs it; reapplying
   *   is redundant in the idempotent case and can race in the dynamic case.
   * - `buildPath` is NOT re-run. The caller's `state.path` is used as-is —
   *   so `trailingSlash:"preserve"` matchedState paths flow through unchanged
   *   (closes #525 Q2). `buildPath` interceptors do NOT run; the URL the
   *   user navigated to is the source of truth for this code path.
   * - All other pipeline steps run unchanged: SAME_STATES check, FSM
   *   transition, guards, `subscribeLeave`, `completeTransition`,
   *   plugin lifecycle hooks.
   */
  navigateToState(state: State, opts: NavigationOptions): Promise<State> {
    this.lastSyncResolved = false;
    const deps = this.#deps;

    if (!deps.canNavigate()) {
      // Stryker disable next-line BooleanLiteral: equivalent — #721 optimization flag (see L95): the cached rejection is suppressed by the facade else-branch regardless of the flag.
      this.lastSyncRejected = true;

      return CACHED_NOT_STARTED_REJECTION;
    }

    // Reject states whose route no longer exists (e.g. the route tree was
    // mutated between matchPath and navigateToState). UNKNOWN_ROUTE is
    // structurally legal — it is the navigateToNotFound output shape.
    if (state.name !== constants.UNKNOWN_ROUTE && !deps.hasRoute(state.name)) {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        routeName: state.name,
      });

      deps.emitTransitionError(undefined, deps.getState(), err);

      // This is a FRESH reject (carries `routeName`), not one of the
      // pre-suppressed CACHED_*_REJECTION singletons. `lastSyncRejected`
      // contractually means "I returned a pre-suppressed cached rejection —
      // skip your .catch()", so leaving it unset lets the facade attach its
      // own suppression. Setting it here leaked an unhandledRejection on
      // fire-and-forget calls (#721).
      return Promise.reject(err);
    }

    // States from `matchPath` are deeply frozen (`freezeStateInPlace`).
    // `completeTransition` mutates `toState.transition` and `context` is
    // intentionally extensible for plugin claim writes, so we hand the
    // pipeline a writable shell — same shape `makeState(skipFreeze=true)`
    // produces. `params` stays referentially shared (already frozen).
    // `transition` is omitted so completeTransition can assign it.
    const writableState = {
      name: state.name,
      params: state.params,
      // Carry the query channel through the writable shell (RFC-4 M2 / #1548) —
      // without this, start()'s navigateToState(matchPath(...)) would drop the
      // matched query from the committed state.
      search: state.search,
      path: state.path,
      context: { ...state.context },
    } as State;

    // Carry the route-meta binding (#1170). `matchPath` / `makeState` attach it
    // to the frozen source `state` via a WeakMap keyed by object reference, so
    // the fresh writable shell would otherwise be meta-less. Without it, two
    // consecutive popstate navigations make both `toState` AND `fromState`
    // meta-less, dropping `getTransitionPath` to FAST PATH 3 (full chains):
    // ancestor guards re-run and browser-back can block where `navigate()`
    // succeeds.
    const meta = getStateMetaParams(state);

    if (meta !== undefined) {
      setStateMetaParams(writableState, meta);
    }

    return this.#executeNavigation(writableState, opts);
  }

  navigateToDefault(opts: NavigationOptions): Promise<State> {
    // Reset the sync-resolution flag on entry, mirroring navigate() and
    // navigateToState(). start() leaves `lastSyncResolved = true`, and the
    // early reject paths below return before delegating to navigate(), so a
    // stale `true` would make the facade take the "already resolved" branch
    // and skip .catch() suppression — leaking an unhandledRejection on
    // fire-and-forget calls (#721).
    this.lastSyncResolved = false;
    const deps = this.#deps;
    const options = deps.getOptions();

    if (!options.defaultRoute) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute not configured",
        }),
      );
    }

    let route: string;
    let params: Params;

    try {
      ({ route, params } = deps.resolveDefault());
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided resolveDefault callback
      return Promise.reject(error);
    }

    if (!route) {
      return Promise.reject(
        new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          routeName: "defaultRoute resolved to empty",
        }),
      );
    }

    return this.navigate(route, params, opts);
  }

  navigateToNotFound(path: string): State {
    // #1186 — liveness gate. This internal commit primitive has no FSM
    // transition of its own, so without this check a `dispose()` that lands
    // while a start-interceptor is parked (FSM already DISPOSED) would let the
    // resuming pipeline commit an UNKNOWN_ROUTE state on the disposed router and
    // `start()` resolve. Symmetric with `navigateToState`'s `canNavigate()` gate
    // (the matched-route branch is already protected). `!isActive()` also covers
    // a merely-stopped (IDLE) router: the only reachable path to that is a direct
    // `router.navigateToNotFound()` on a stopped instance (internal callers run
    // during STARTING, which is active), so the ROUTER_DISPOSED code is slightly
    // broad there — fail-closed is deliberate (committing on a stopped router is
    // out of contract), and the disposed race is the case that matters.
    if (!this.#deps.isActive()) {
      throw new RouterError(errorCodes.ROUTER_DISPOSED);
    }

    this.#abortPreviousNavigation();

    const fromState = this.#deps.getState();
    const deactivated: string[] = fromState
      ? nameToIDs(fromState.name).toReversed()
      : [];

    Object.freeze(deactivated);

    const segments: TransitionMeta["segments"] = {
      deactivated,
      activated: FROZEN_ACTIVATED,
      intersection: "",
    };

    Object.freeze(segments);

    const transitionMeta: TransitionMeta = {
      phase: "activating",
      ...(fromState && { from: fromState.name }),
      reason: "success",
      replace: true,
      segments,
    };

    Object.freeze(transitionMeta);

    const state: State = {
      name: constants.UNKNOWN_ROUTE,
      params: EMPTY_PARAMS,
      search: EMPTY_SEARCH,
      path,
      transition: transitionMeta,
      context: {},
    };

    Object.freeze(state);

    this.#deps.setState(state);
    this.#deps.emitTransitionSuccess(state, fromState, FROZEN_REPLACE_OPTS);

    return state;
  }

  /**
   * Aborts and releases the in-flight navigation's `AbortController` (waking the
   * parked async pipeline via `onInternalAbort`). This is the
   * **effect** of the FSM `CANCEL` action (`handleCancel` → injected
   * `deps.abortCurrentController`), not something cancellation sources call
   * directly — so "FSM `CANCEL` ⟹ controller aborted" holds in one place (RFC
   * navigation-cancellation-unification §5). `reason` (e.g. an external
   * `opts.signal`'s reason, #943) becomes the controller's `signal.reason`;
   * defaults to `TRANSITION_CANCELLED`.
   */
  abortCurrentController(reason?: unknown): void {
    this.#currentController?.abort(
      reason ?? new RouterError(errorCodes.TRANSITION_CANCELLED),
    );
    this.#currentController = null;
  }

  #executeNavigation(toState: State, opts: NavigationOptions): Promise<State> {
    const deps = this.#deps;
    let fromState: State | undefined;
    let transitionStarted = false;
    let controller: AbortController | null = null;

    try {
      fromState = deps.getState();
      opts = forceReplaceFromUnknown(opts, fromState);

      if (isSameNavigation(fromState, opts, toState)) {
        deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);
        // Stryker disable next-line BooleanLiteral: equivalent — #721 optimization flag (see L95): the cached rejection is suppressed by the facade else-branch regardless of the flag.
        this.lastSyncRejected = true;

        return CACHED_SAME_STATES_REJECTION;
      }

      this.#abortPreviousNavigation(opts.signal);

      // Stryker disable next-line UpdateOperator: equivalent — `#navigationId` is only ever compared by identity (`!== myId`) to detect supersession; uniqueness per navigation is all that matters, so `--` (decreasing ids) is indistinguishable from `++`.
      const myId = ++this.#navigationId;

      // #1169 commit-gate — liveness snapshot captured BEFORE the pre-commit
      // listener windows. A listener's `stop()`/`dispose()` runs `clearAll()`,
      // which empties the listener lists, so the marker must be read now, not at
      // the commit site (that self-destruct was the QB/QE hole, RFC §5-bis).
      // `suspendable` is true only when a synchronous supersede is reachable — an
      // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit
      // plugin listener (`onTransitionStart` / `onTransitionLeaveApprove`); the
      // pure synchronous navigate (none of these) is uncancellable and skips the
      // gate, keeping the #307 hot path perf-neutral.
      const suspendable =
        opts.signal !== undefined ||
        deps.hasLeaveListeners() ||
        deps.hasPreCommitListeners();

      deps.startTransition(toState, fromState);
      transitionStarted = true;

      // Post-`startTransition` supersession is now caught at the commit-gate
      // below (before `completeTransition`'s setState): a `stop()`/`dispose()`/
      // external-abort from the TRANSITION_START listener leaves the FSM in
      // IDLE/DISPOSED, which `!deps.isActive()` detects. (Async supersession is
      // additionally caught in `#finishAsyncNavigation` / the guard pipeline's
      // `isCurrentNav`; a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

      const [canDeactivateFunctions, canActivateFunctions] =
        deps.getLifecycleFunctions();
      const isUnknownRoute = toState.name === constants.UNKNOWN_ROUTE;

      const transitionPath = getTransitionPath(toState, fromState);
      const { toDeactivate, toActivate, intersection } = transitionPath;

      const shouldDeactivate =
        fromState && !opts.forceDeactivate && toDeactivate.length > 0;
      const shouldActivate = !isUnknownRoute && toActivate.length > 0;
      const hasGuards =
        canDeactivateFunctions.size > 0 || canActivateFunctions.size > 0;

      const confirmedToState = toState;

      if (!hasGuards) {
        const asyncLeave = this.#handleNoGuardsLeave(
          confirmedToState,
          fromState,
          myId,
          opts,
          transitionPath,
          canDeactivateFunctions,
        );

        if (asyncLeave !== undefined) {
          return asyncLeave;
        }
      }

      // Stryker disable next-line ConditionalExpression: equivalent — running the guard pipeline on the no-guards path does not double-emit LEAVE_APPROVE (full suite green with `if (true)`); the BlockStatement mutant stays live (killed by guarded-route tests).
      // eslint-disable-next-line unicorn/prefer-else-if -- two exhaustive `if`s read clearer here than an else-if; merging cascades into no-negated-condition / no-unnecessary-condition in this hot guard-setup branch
      if (hasGuards) {
        controller = new AbortController();
        this.#currentController = controller;
        const isCurrentNav = () =>
          this.#navigationId === myId && deps.isActive();

        const signal = controller.signal;

        const emitLeaveApproveCallback = (): Promise<void> | undefined => {
          deps.sendLeaveApprove(confirmedToState, fromState);

          if (deps.hasLeaveListeners()) {
            return deps.awaitLeaveListeners(
              confirmedToState,
              fromState,
              signal,
            );
          }

          return undefined;
        };

        const guardCompletion = executeGuardPipeline(
          canDeactivateFunctions,
          canActivateFunctions,
          toDeactivate,
          toActivate,
          !!shouldDeactivate,
          shouldActivate,
          toState,
          fromState,
          signal,
          isCurrentNav,
          emitLeaveApproveCallback,
        );

        if (guardCompletion !== undefined) {
          return this.#finishAsyncNavigation(
            guardCompletion,
            {
              toState,
              fromState,
              opts,
              toDeactivate,
              toActivate,
              intersection,
              canDeactivateFunctions,
            },
            controller,
            myId,
          );
        }

        if (!isCurrentNav()) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        this.#cleanupController(controller, false);
      }

      // #1169 commit-gate — refuse to commit a navigation cancelled or
      // terminated during a listener window, BEFORE `completeTransition`'s
      // setState. The FSM table (D-full) already prevents the forceState
      // resurrection; this prevents the state commit that precedes the emit.
      // Gated on `suspendable` so the pure sync hot path pays nothing. A
      // `stop()`/`dispose()` from the listener lands the FSM in IDLE/DISPOSED
      // (caught by `!isActive()`); an external `opts.signal` abort is caught
      // directly. No `#navigationId` check: a reentrant navigate() (the only
      // thing that could bump it synchronously) is banned (REENTRANT_NAVIGATION,
      // §4), so on this sync path `#navigationId === myId` always holds — async
      // supersede is caught in `#finishAsyncNavigation`'s `isCurrentNav`.
      if (suspendable && (!deps.isActive() || opts.signal?.aborted === true)) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      const finalState = completeTransition(deps, {
        toState,
        fromState,
        opts,
        toDeactivate,
        toActivate,
        intersection,
        canDeactivateFunctions,
      });

      // Mark sync-resolution only AFTER completeTransition returns. It emits
      // TRANSITION_SUCCESS; listener throws are all isolated via onListenerError
      // (the emitter re-throws nothing now that re-entrant emits are coalesced,
      // #1033, and reentrant navigate/CRUD are banned), so the emit itself does
      // not throw. Should completeTransition throw for any other reason, setting
      // the flag optimistically BEFORE it would leave the flag stale-true, so the
      // facade would read lastSyncResolved and skip its suppressing `.catch()` —
      // the rejection would then leak as a Node unhandledRejection. Post-emit
      // placement keeps the flag false on a throw, so control falls to catch and
      // the facade attaches its `.catch`.
      // Stryker disable next-line BooleanLiteral: equivalent — flipping to false routes the facade to the else-branch, which attaches a harmless .catch to an already-resolved promise; there is no rejection to suppress.
      this.lastSyncResolved = true;

      return Promise.resolve(finalState);
    } catch (error) {
      this.#handleNavigateError(
        error,
        controller,
        transitionStarted,
        toState,
        fromState,
      );

      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from guards or transition pipeline
      return Promise.reject(error);
    }
  }

  async #finishAsyncNavigation(
    guardCompletion: Promise<void>,
    nav: NavigationContext,
    controller: AbortController,
    myId: number,
  ): Promise<State> {
    const deps = this.#deps;
    const isActive = () =>
      this.#navigationId === myId &&
      !controller.signal.aborted &&
      deps.isActive();

    const externalSignal = nav.opts.signal;
    let onExternalAbort: (() => void) | undefined;
    let onInternalAbort: (() => void) | undefined;
    let succeeded = false;
    let failureReason: unknown;

    // #1018: race the guard completion against the controller's abort so a
    // non-cooperative guard whose Promise never settles (and ignores `signal`)
    // cannot wedge navigate() forever. `abortRace` RESOLVES on abort, so the
    // post-race `isActive()` check below throws TRANSITION_CANCELLED — the same
    // path that already handles a guard which swallows the abort and resolves
    // `true`. `stop()`/`dispose()`/supersede all abort the controller. Mirrors
    // the leave-path protection `settleLeavePromises` (#663/#673).
    const abortRace = new Promise<void>((resolve) => {
      if (controller.signal.aborted) {
        resolve();

        return;
      }

      onInternalAbort = () => {
        resolve();
      };

      controller.signal.addEventListener("abort", onInternalAbort, {
        once: true,
      });
    });

    // Consume `guardCompletion` when the abort wins the race: a slow or
    // never-settling guard that settles later then has no awaiter, which would
    // surface as an unhandled rejection without this catch.
    guardCompletion.catch(() => {
      /* settlement consumed — the race already decided the navigation */
    });

    try {
      if (externalSignal) {
        if (externalSignal.aborted) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
            reason: externalSignal.reason,
          });
        }

        // Bridge an external `{ signal }` abort onto the internal controller.
        // It is NOT scoped to `controller.signal` (the old `{ signal }` option)
        // because success no longer aborts the controller (#722) — the listener
        // is detached explicitly in `finally` instead.
        onExternalAbort = () => {
          // (#1030): route the external abort through the FSM. The
          // `CANCEL` action aborts the internal controller (waking THIS pipeline)
          // with the external `reason` (#943 — surfaces via the leave signal) AND
          // returns the FSM to READY, atomically. No direct `controller.abort`
          // here — "FSM CANCEL ⟹ controller aborted" lives in one place
          // (handleCancel). onExternalAbort only fires while the navigation is in
          // flight (the listener is removed in `finally` once it settles), so the
          // FSM is always cancellable here.
          deps.cancelNavigation(externalSignal.reason);
        };
        // Stryker disable next-line ObjectLiteral: equivalent — `{ once: true }` is redundant: the per-navigation signal aborts at most once and is discarded unaborted on success, and the `finally` block explicitly removeEventListener's it.
        externalSignal.addEventListener("abort", onExternalAbort, {
          // Stryker disable next-line BooleanLiteral: equivalent — `once` redundant (see ObjectLiteral above); the listener is explicitly removed in `finally`.
          once: true,
        });
      }

      await Promise.race([guardCompletion, abortRace]);

      if (!isActive()) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      const state = completeTransition(deps, nav);

      succeeded = true;

      return state;
    } catch (error) {
      failureReason = error;

      routeTransitionError(deps, error, nav.toState, nav.fromState);

      throw error;
      // NB: the `} finally {}` BlockStatement mutant SURVIVES but is EQUIVALENT —
      // emptying the finally only skips #cleanupController, which is unobservable
      // (defense-in-depth: on a CANCEL the FSM CANCEL action already aborted+nulled
      // the controller via abortCurrentController, RFC §5; the success-path
      // ref-release is proven unobservable — see #cleanupController's disable). It
      // cannot be inline-`Stryker disable`d: the catch `}` and finally `{` share one
      // line, so there is no comment position that targets the finally body. Left documented.
    } finally {
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — listener cleanup is redundant: the per-navigation signal is discarded on completion, so skipping the removeEventListener leaks nothing observable.
      if (onExternalAbort) {
        // Stryker disable next-line StringLiteral: equivalent — cleanup event name is redundant (listener is `{ once: true }` and the signal is discarded), so a wrong name removes nothing observable.
        externalSignal?.removeEventListener("abort", onExternalAbort);
      }

      // Detach the abort-race listener before #cleanupController aborts the
      // controller below, so the cleanup abort cannot re-fire it. `undefined`
      // only when the controller was already aborted at setup (the early-resolve
      // branch above registered no listener).
      if (onInternalAbort) {
        controller.signal.removeEventListener("abort", onInternalAbort);
      }

      // Success drops the controller without aborting (the subscribeLeave signal
      // must stay unaborted); cancel/error aborts it with the originating reason
      // so captured signals expose the real cause via `signal.reason` (#943).
      this.#cleanupController(controller, !succeeded, failureReason);
    }
  }

  #handleNavigateError(
    error: unknown,
    controller: AbortController | null,
    transitionStarted: boolean,
    toState: State | undefined,
    fromState: State | undefined,
  ): void {
    if (controller) {
      this.#cleanupController(controller, true, error);
    }

    if (transitionStarted && toState) {
      routeTransitionError(this.#deps, error, toState, fromState);
    }
  }

  #handleNoGuardsLeave(
    toState: State,
    fromState: State | undefined,
    myId: number,
    opts: NavigationOptions,
    transitionPath: TransitionPath,
    canDeactivateFunctions: Map<string, GuardFn>,
  ): Promise<State> | undefined {
    const deps = this.#deps;

    deps.sendLeaveApprove(toState, fromState);

    if (deps.hasLeaveListeners()) {
      const controller = new AbortController();

      // Track as the current navigation BEFORE listeners run so a reentrant
      // navigate() / stop() / dispose() from a sync listener aborts THIS leave
      // signal — parity with the guard path (#722). On success the controller is
      // released without aborting (see #cleanupController).
      this.#currentController = controller;

      let leaveResult: Promise<void> | undefined;

      try {
        leaveResult = deps.awaitLeaveListeners(
          toState,
          fromState,
          controller.signal,
        );
      } catch (error) {
        // A sync listener threw — the navigation fails; abort the leave signal
        // with the thrown value so a listener that captured the signal sees the
        // real cause via `signal.reason`, not a generic AbortError (#943).
        this.#cleanupController(controller, true, error);

        throw error;
      }

      if (leaveResult !== undefined) {
        return this.#finishAsyncNavigation(
          leaveResult,
          {
            toState,
            fromState,
            opts,
            toDeactivate: transitionPath.toDeactivate,
            toActivate: transitionPath.toActivate,
            intersection: transitionPath.intersection,
            canDeactivateFunctions,
          },
          controller,
          myId,
        );
      }

      // Sync listeners settled. A synchronous reentrant navigate() can no longer
      // supersede here (banned, RFC §4), so the leave always succeeds: release the
      // controller WITHOUT aborting (the subscribeLeave signal must stay live).
      this.#cleanupController(controller, false);

      return undefined;
    }

    // No leave listeners: nothing synchronous could have superseded this
    // navigation during the LEAVE_APPROVE emit (reentrant navigate is banned).
    return undefined;
  }

  /**
   * Release a navigation's AbortController. The same `controller.signal` is
   * handed to `subscribeLeave` listeners, so it must abort **only** when the
   * navigation is cancelled or errors — never on success (#722). On the success
   * path pass `cancelled = false`: the reference is dropped without aborting, so
   * a listener that captured the signal still sees `aborted === false`.
   *
   * On the failure/cancellation path (`cancelled = true`) pass the originating
   * `reason` so `signal.reason` carries router/error context (a `RouterError`,
   * or the value a sync leave listener threw) — consistent with the cancellation
   * abort `RouterError(TRANSITION_CANCELLED)`, not a generic `AbortError` (#943).
   * `abort()` is idempotent: a controller already aborted by a superseding
   * navigation keeps its first (also-meaningful) reason.
   */
  #cleanupController(
    controller: AbortController,
    cancelled: boolean,
    reason?: unknown,
  ): void {
    if (cancelled) {
      controller.abort(reason);
    }

    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — controller identity-guard; cleanup correctness is enforced by #abortPreviousNavigation + the navigationId/isCurrentNav checks. Full suite stays green with `=== → !==` (nulls the wrong controller) and with the body removed (ref never nulled), so no mutant here is observable.
    if (this.#currentController === controller) {
      this.#currentController = null;
    }
  }

  #abortPreviousNavigation(externalSignal?: AbortSignal): void {
    if (this.#deps.isTransitioning()) {
      this.#deps.logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use cloneRouter() to create isolated instance per request.",
      );
      // The FSM CANCEL action aborts the previous controller — no
      // direct controller.abort here (RFC navigation-cancellation-unification §5).
      this.#deps.cancelNavigation();
    }

    if (externalSignal?.aborted) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
        reason: externalSignal.reason,
      });
    }
  }
}
