import { logger } from "@real-router/logger";

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
import { EMPTY_PARAMS, errorCodes, constants } from "../../constants";
import { RouterError } from "../../RouterError";
import { getTransitionPath, nameToIDs } from "../../transitionPath";

import type { NavigationContext, NavigationDependencies } from "./types";
import type { TransitionPath } from "../../transitionPath";
import type {
  GuardFn,
  NavigationOptions,
  Params,
  State,
  TransitionMeta,
} from "@real-router/types";

const FROZEN_ACTIVATED: string[] = [constants.UNKNOWN_ROUTE];

Object.freeze(FROZEN_ACTIVATED);
const FROZEN_REPLACE_OPTS: NavigationOptions = { replace: true };

Object.freeze(FROZEN_REPLACE_OPTS);

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
      path: state.path,
      context: { ...state.context },
    } as State;

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
      path,
      transition: transitionMeta,
      context: {},
    };

    Object.freeze(state);

    this.#deps.setState(state);
    this.#deps.emitTransitionSuccess(state, fromState, FROZEN_REPLACE_OPTS);

    return state;
  }

  abortCurrentNavigation(): void {
    this.#currentController?.abort(
      new RouterError(errorCodes.TRANSITION_CANCELLED),
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

      deps.startTransition(toState, fromState);
      transitionStarted = true;

      // Reentrant navigate from TRANSITION_START listener superseded this navigation
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — fail-fast reentrant guard; supersession is also enforced downstream (handleNoGuardsLeave navigationId check + isCurrentNav in the guard pipeline), so dropping the throw is unobservable (full suite green with `if (false)`). The EqualityOperator mutant stays live (=== throws on every navigation).
      if (this.#navigationId !== myId) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

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

      // Stryker disable next-line BooleanLiteral: equivalent — not flagging the sync-resolved promise routes the facade to the else-branch, which attaches a harmless .catch to an already-resolved promise; there is no rejection to suppress.
      this.lastSyncResolved = true;

      return Promise.resolve(
        completeTransition(deps, {
          toState,
          fromState,
          opts,
          toDeactivate,
          toActivate,
          intersection,
          canDeactivateFunctions,
        }),
      );
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
    let succeeded = false;
    let failureReason: unknown;

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
          controller.abort(externalSignal.reason);
        };
        // Stryker disable next-line ObjectLiteral: equivalent — `{ once: true }` is redundant: the per-navigation signal aborts at most once and is discarded unaborted on success, and the `finally` block explicitly removeEventListener's it.
        externalSignal.addEventListener("abort", onExternalAbort, {
          // Stryker disable next-line BooleanLiteral: equivalent — `once` redundant (see ObjectLiteral above); the listener is explicitly removed in `finally`.
          once: true,
        });
      }

      await guardCompletion;

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
      // (defense-in-depth: abortCurrentNavigation on stop/dispose +
      // #abortPreviousNavigation on concurrent nav; the success-path ref-release is
      // proven unobservable — see #cleanupController's disable). It cannot be
      // inline-`Stryker disable`d: the catch `}` and finally `{` share one line, so
      // there is no comment position that targets the finally body. Left documented.
    } finally {
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — listener cleanup is redundant: the per-navigation signal is discarded on completion, so skipping the removeEventListener leaks nothing observable.
      if (onExternalAbort) {
        // Stryker disable next-line StringLiteral: equivalent — cleanup event name is redundant (listener is `{ once: true }` and the signal is discarded), so a wrong name removes nothing observable.
        externalSignal?.removeEventListener("abort", onExternalAbort);
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

      // Sync listeners settled. A reentrant navigate() may have superseded us
      // (it already aborted this controller); surface that as a cancellation.
      const cancelled = this.#navigationId !== myId;

      this.#cleanupController(controller, cancelled);

      if (cancelled) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      return undefined;
    }

    if (this.#navigationId !== myId) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

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
      logger.warn(
        "router.navigate",
        "Concurrent navigation detected on shared router instance. " +
          "For SSR, use cloneRouter() to create isolated instance per request.",
      );
      this.#currentController?.abort(
        new RouterError(errorCodes.TRANSITION_CANCELLED),
      );
      this.#deps.cancelNavigation();
    }

    if (externalSignal?.aborted) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED, {
        reason: externalSignal.reason,
      });
    }
  }
}
