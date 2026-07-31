import {
  CACHED_NOT_STARTED_REJECTION,
  CACHED_ROUTE_NOT_FOUND_ERROR,
  CACHED_ROUTE_NOT_FOUND_REJECTION,
  CACHED_SAME_STATES_ERROR,
  CACHED_SAME_STATES_REJECTION,
  isExpectedRejection,
  PRE_SUPPRESSED,
} from "./constants";
import { InFlightNavigation } from "./inFlightNavigation";
import { completeTransition } from "./transition/completeTransition";
import { routeTransitionError } from "./transition/errorHandling";
import { executeGuardPipeline } from "./transition/guardPhase";
import { findMisChanneledKey, misChanneledKeyMessage } from "../../channels";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  errorCodes,
  constants,
} from "../../constants";
import { RouterError } from "../../RouterError";
import { getTransitionPath, nameToIDs } from "../../transitionPath";

import type {
  NavigationContext,
  NavigationDependencies,
  NavigationPlan,
} from "./types";
import type {
  GuardFn,
  NavigationOptions,
  Params,
  SearchParams,
  State,
  TransitionMeta,
} from "../../types";

// Write-once placeholders for `NavigationPlan`'s pass-2 fields. Module-level so
// building a plan allocates nothing beyond the plan itself; never mutated —
// `#planPhases` overwrites the SLOTS, it does not write through them.
const NO_SEGMENTS: string[] = Object.freeze([]) as unknown as string[];
const NO_GUARDS = new Map<string, GuardFn>();

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

/**
 * Does any segment this phase walks carry a guard?
 *
 * The empty-Map check first, so a router with no guards at all pays one load —
 * and a router that HAS guards pays one `Map.has` per segment on the path,
 * against the ~40 ns + 482 B an AbortController costs when the answer is no.
 */
function hasGuardOnPath(
  guards: Map<string, GuardFn>,
  segments: string[],
): boolean {
  if (guards.size === 0) {
    return false;
  }

  for (const segment of segments) {
    if (guards.has(segment)) {
      return true;
    }
  }

  return false;
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
  #deps!: NavigationDependencies;
  #onSuppressed!: (error: unknown) => void;
  // The controller + supersession token of the navigation in flight, owned as
  // one thing (#1607). Built here, one per router — never per navigation.
  readonly #inFlight = new InFlightNavigation();

  // =========================================================================
  // Dependency injection
  // =========================================================================

  setDependencies(deps: NavigationDependencies): void {
    this.#deps = deps;
    // Built once here rather than per call: the closure needs THIS router's
    // logger, so it cannot be static, and `setDependencies` is a pure
    // assignment that runs exactly once at wiring (#1331).
    this.#onSuppressed = (error: unknown): void => {
      if (isExpectedRejection(error)) {
        return;
      }

      deps.logger.error(
        "router.navigate",
        "Unexpected navigation error",
        error,
      );
    };
  }

  // =========================================================================
  // Instance methods
  // =========================================================================

  navigate(
    name: string,
    params: Params,
    search: SearchParams | undefined,
    opts: NavigationOptions,
  ): State | Promise<State> {
    return this.#settle(this.#navigate(name, params, search, opts));
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
  navigateToState(
    state: State,
    opts: NavigationOptions,
  ): State | Promise<State> {
    return this.#settle(this.#navigateToState(state, opts));
  }

  navigateToDefault(opts: NavigationOptions): State | Promise<State> {
    return this.#settle(this.#navigateToDefault(opts));
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
    this.#inFlight.abort(reason);
  }

  /**
   * The producer's own fire-and-forget guarantee (#721): whatever leaves a
   * public method here is safe to drop on the floor.
   *
   * ONE checkpoint per public method, deliberately — not a `.catch()` at each of
   * the six return sites. A forgotten site is invisible until it leaks, which is
   * the bug this replaces; a single choke point cannot be forgotten. And the
   * discriminator is the returned VALUE's identity, not a flag the facade reads
   * afterwards: `PRE_SUPPRESSED` promises already carry a module-load handler, so
   * re-suppressing them buys nothing and costs a derived promise.
   *
   * A synchronously-returned `State` needs nothing at all — there is no rejection
   * to suppress, which is precisely what makes `lastSyncResolved` unnecessary:
   * the TYPE now carries what the flag used to announce.
   */
  #settle(result: State | Promise<State>): State | Promise<State> {
    if (result instanceof Promise && !PRE_SUPPRESSED.has(result)) {
      result.catch(this.#onSuppressed);
    }

    return result;
  }

  /**
   * `navigate`'s body, minus the fire-and-forget checkpoint.
   *
   * Split out because `navigateToDefault` delegates HERE, not to the public
   * method: routing it through `navigate` would run `#settle` twice per default
   * navigation and attach a second, pointless `.catch()` — an extra derived
   * promise on a path that has none today.
   */
  #navigate(
    name: string,
    params: Params,
    search: SearchParams | undefined,
    opts: NavigationOptions,
  ): State | Promise<State> {
    const deps = this.#deps;

    // Fast-path sync rejections: cached error + cached Promise.reject.
    // No allocations, no throw/catch overhead; `#settle` recognises the
    // singleton by identity and skips its `.catch()`.
    if (!deps.canNavigate()) {
      return CACHED_NOT_STARTED_REJECTION;
    }

    let toState: State | undefined;

    try {
      toState = deps.buildNavigateState(name, params, search);
    } catch (error) {
      // No `v8 ignore` here any more: the comment that used to sit above this
      // line claimed the path was "reachable only via validator-driven throws
      // … covered in @real-router/validation-plugin's suite, not in core", and
      // that stopped being true when the always-on channel guard (#1572) began
      // throwing from core's own `buildNavigateState`. Measured: with the ignore
      // removed, core's suite still reports 100% — it was masking a live region.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve original throw shape from user-provided buildNavigateState
      return Promise.reject(error);
    }

    if (!toState) {
      deps.emitTransitionError(
        undefined,
        deps.getState(),
        CACHED_ROUTE_NOT_FOUND_ERROR,
      );

      return CACHED_ROUTE_NOT_FOUND_REJECTION;
    }

    return this.#executeNavigation(toState, opts);
  }

  #navigateToState(
    state: State,
    opts: NavigationOptions,
  ): State | Promise<State> {
    const deps = this.#deps;

    if (!deps.canNavigate()) {
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

      // A FRESH reject (it carries `routeName`), so it is deliberately NOT in
      // `PRE_SUPPRESSED` and `#settle` will attach its `.catch()`. Adding it to
      // that set — the modern shape of the mistake that caused #721 — would skip
      // suppression on a promise nobody else handles and leak it.
      return Promise.reject(err);
    }

    // Channel guard, position P3 (#1572). `navigateToState` is the ONE producer
    // that takes a ready-made `State` instead of a `params` argument, so the
    // predicate reads `state.params ∩ queryNames(state.name)`. What it commits
    // becomes `getState()`, so a pre-M2 layout would be silent corruption: the
    // key sits in `state.params` and never reaches `state.path`.
    //
    // Costs nothing on healthy flows — a state produced by core (`matchPath`,
    // `makeState`) is channel-correct by construction, so the predicate is
    // empty on every popstate / memory-restore / SSR-hydration commit. `start()`
    // commits THROUGH here (`RouterLifecycleNamespace`), which is why the guard
    // lives in the namespace rather than on the plugin-API door.
    //
    // Rejects rather than throwing, mirroring the ROUTE_NOT_FOUND guard above:
    // this method returns `Promise<State>` and its URL-plugin callers invoke it
    // from popstate handlers, where a new synchronous throw would be a change
    // of failure shape rather than a new failure.
    const misChanneled = findMisChanneledKey(
      state.params,
      deps.getQueryParams(state.name),
    );

    if (misChanneled !== undefined) {
      const err = new RouterError(errorCodes.WRONG_CHANNEL, {
        routeName: state.name,
        message: `[router.navigateToState] ${misChanneledKeyMessage(
          state.name,
          misChanneled,
          "`state.params`",
        )}`,
      });

      deps.emitTransitionError(undefined, deps.getState(), err);

      return Promise.reject(err);
    }

    // States from `matchPath` are deeply frozen (`freezeStateShell`).
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

    // No route-meta to carry any more (RFC-4 M2 / #1548): ownership is read from
    // the live matcher by `state.name` (`getTransitionPath`'s `getMeta`), not
    // from a per-State WeakMap. The former #1170 carry — which existed only so a
    // matchPath-derived writable shell stayed non-meta-less across consecutive
    // popstate navs — is obsolete: any state whose name is in the tree takes the
    // STANDARD PATH regardless of object identity.

    return this.#executeNavigation(writableState, opts);
  }

  #navigateToDefault(opts: NavigationOptions): State | Promise<State> {
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
    let search: SearchParams;

    try {
      ({ route, params, search } = deps.resolveDefault());
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

    // Both channels, never one bag (RFC-4 M2 / #1548). The query slot took
    // `undefined` until `defaultSearch` existed as a router option, so a
    // query-declared name in `defaultParams` reached the URL only via the
    // `forwardState` seam's channel re-separation — the repair the pipeline
    // design removes. Passing the query here makes the default route's query
    // defaults independent of that stage.
    //
    // Delegates to the PRIVATE core: the public `navigate` would run `#settle`
    // here and again in this method's own wrapper, costing a second `.catch()`
    // per default navigation.
    return this.#navigate(route, params, search, opts);
  }

  /**
   * Pass 1 of the shared prologue: reserve the navigation, then announce it.
   *
   * Ends with `startTransition` DELIBERATELY, and nothing follows it here. That
   * makes "this threw" strictly equivalent to "TRANSITION_START never fired", so
   * the caller can set its `transitionStarted` marker immediately after the call
   * and stay exactly as accurate as the inline version was.
   *
   * The three statements before it are ordered, not incidental:
   * `#abortPreviousNavigation` may run FSM `CANCEL` (whose listeners can add or
   * drop subscriptions), so `suspendable` has to be read after it — and before
   * `startTransition`, whose listeners a `stop()` would use to empty those same
   * lists (#1169, the QB/QE hole).
   */
  #beginTransition(
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ): NavigationPlan {
    const deps = this.#deps;

    this.#abortPreviousNavigation(opts.signal);

    const myId = this.#inFlight.begin();

    // `suspendable` is true only when a synchronous supersede is reachable — an
    // external `opts.signal`, `subscribeLeave` listeners, or a pre-commit plugin
    // listener (`onTransitionStart` / `onTransitionLeaveApprove`); the pure
    // synchronous navigate (none of these) is uncancellable and skips the
    // commit-gate, keeping the #307 hot path perf-neutral.
    const plan: NavigationPlan = {
      toState,
      fromState,
      opts,
      myId,
      suspendable:
        opts.signal !== undefined ||
        deps.hasLeaveListeners() ||
        deps.hasPreCommitListeners(),
      // Write-once placeholders — pass 2 fills them (see `NavigationPlan`).
      toDeactivate: NO_SEGMENTS,
      toActivate: NO_SEGMENTS,
      intersection: "",
      canDeactivateFunctions: NO_GUARDS,
      canActivateFunctions: NO_GUARDS,
      shouldDeactivate: false,
      shouldActivate: false,
      hasGuards: false,
    };

    deps.startTransition(toState, fromState);

    return plan;
  }

  /**
   * The uninterruptible navigation, end to end (RFC §5.1, разрез А).
   *
   * Reached only when `!hasGuards && !suspendable` — no guards to run, no
   * `subscribeLeave` listener, no caller `signal`, no pre-commit plugin
   * listener. Nothing can cancel it and nothing in it can suspend, so the
   * cancellation machinery is not *skipped* here: it is ABSENT. No
   * `AbortController`, no `isCurrentNav` closure, no commit-gate, and the return
   * type is a plain `State` rather than a Promise — being unable to suspend is a
   * property of the code, not a fact one has to remember.
   *
   * The `LEAVE_APPROVE` emit stays: it is an FSM transition every navigation
   * makes, and with no leave listeners there is nothing to await behind it.
   */
  #completeImmediate(plan: NavigationPlan): State {
    const deps = this.#deps;

    deps.sendLeaveApprove(plan.toState, plan.fromState);

    return completeTransition(deps, plan);
  }

  /**
   * Pass 2: work out the shape of the transition, now that it is announced.
   *
   * Runs AFTER `startTransition` because a `TRANSITION_START` listener may still
   * register a guard, and the guard maps must reflect that.
   */
  #planPhases(plan: NavigationPlan): void {
    const deps = this.#deps;
    const [canDeactivateFunctions, canActivateFunctions] =
      deps.getLifecycleFunctions();

    const { toDeactivate, toActivate, intersection } = getTransitionPath(
      plan.toState,
      plan.fromState,
      (name) => deps.getMetaForState(name),
    );

    plan.canDeactivateFunctions = canDeactivateFunctions;
    plan.canActivateFunctions = canActivateFunctions;
    plan.toDeactivate = toDeactivate;
    plan.toActivate = toActivate;
    plan.intersection = intersection;
    plan.shouldDeactivate =
      !!plan.fromState && !plan.opts.forceDeactivate && toDeactivate.length > 0;
    plan.shouldActivate =
      plan.toState.name !== constants.UNKNOWN_ROUTE && toActivate.length > 0;
    // The guards of THIS transition, not of the router. Asking the Maps for
    // their size answered a different question — "does the app have a guard
    // anywhere" — so one `canActivate` on an admin page armed the cancellation
    // machinery for every public navigation: an AbortController, the liveness
    // closure, and a walk that found no guard on any of its steps (measured:
    // +643 B and +84 ns per navigation that never touches the guarded route).
    //
    // The predicate mirrors what the interpreter would actually do — a phase
    // whose short-circuit is false runs no step, so its guards cannot fire —
    // which is what keeps this a fast-path gate and not a second policy.
    plan.hasGuards =
      (plan.shouldDeactivate &&
        hasGuardOnPath(canDeactivateFunctions, toDeactivate)) ||
      (plan.shouldActivate && hasGuardOnPath(canActivateFunctions, toActivate));
  }

  #executeNavigation(
    toState: State,
    opts: NavigationOptions,
  ): State | Promise<State> {
    const deps = this.#deps;
    let fromState: State | undefined;
    let transitionStarted = false;
    let controller: AbortController | null = null;

    try {
      fromState = deps.getState();
      opts = forceReplaceFromUnknown(opts, fromState);

      if (isSameNavigation(fromState, opts, toState)) {
        deps.emitTransitionError(toState, fromState, CACHED_SAME_STATES_ERROR);

        return CACHED_SAME_STATES_REJECTION;
      }

      const plan = this.#beginTransition(toState, fromState, opts);

      transitionStarted = true;

      // Post-`startTransition` supersession is now caught at the commit-gate
      // below (before `completeTransition`'s setState): a `stop()`/`dispose()`/
      // external-abort from the TRANSITION_START listener leaves the FSM in
      // IDLE/DISPOSED, which `!deps.isActive()` detects. (Async supersession is
      // additionally caught in `#finishAsyncNavigation` / the guard pipeline's
      // `isCurrentNav`; a reentrant navigate() is banned — REENTRANT_NAVIGATION.)

      this.#planPhases(plan);

      // Разрез А (RFC §5.1). `immediate` is the RFC's four-term predicate
      // written in the terms that already exist: `suspendable` IS
      // `signal || leaveListeners || preCommitListeners`, so the whole thing is
      // `!hasGuards && !suspendable`. Nothing can interrupt such a navigation and
      // nothing in it can suspend, so the machinery for both is not skipped —
      // `#completeImmediate` does not contain it.
      //
      // Decided HERE and not at the entry point, deliberately: `hasGuards` is
      // only knowable after `startTransition`, because a `TRANSITION_START`
      // listener may still register a guard. Hoisting the read would change
      // behaviour, not just shape.
      if (!plan.hasGuards && !plan.suspendable) {
        return this.#completeImmediate(plan);
      }

      const {
        myId,
        suspendable,
        canDeactivateFunctions,
        canActivateFunctions,
        toDeactivate,
        toActivate,
        shouldDeactivate,
        shouldActivate,
        hasGuards,
      } = plan;

      const confirmedToState = toState;

      if (!hasGuards) {
        const asyncLeave = this.#handleNoGuardsLeave(plan);

        if (asyncLeave !== undefined) {
          return asyncLeave;
        }
      }

      // NOT equivalent, and the `Stryker disable: equivalent` that used to sit
      // here was wrong: with `if (true)` the guard branch runs AFTER
      // `#handleNoGuardsLeave` already emitted LEAVE_APPROVE, so
      // `emitLeaveApproveCallback` dispatches every `subscribeLeave` listener a
      // SECOND time (measured: 2 calls, 1 expected). The whole suite stayed
      // green because the shared `createTestRouter` fixture carries definition
      // guards, so no test ever reached this branch with `hasGuards` false —
      // `guard-phase-emit-leave-approve.test.ts` now builds a guard-free router
      // and kills both mutants.
      // eslint-disable-next-line unicorn/prefer-else-if -- two exhaustive `if`s read clearer here than an else-if; merging cascades into no-negated-condition / no-unnecessary-condition in this hot guard-setup branch
      if (hasGuards) {
        controller = new AbortController();
        this.#inFlight.adopt(controller);
        const isCurrentNav = () =>
          this.#inFlight.isCurrent(myId) && deps.isActive();

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
          shouldDeactivate,
          shouldActivate,
          toState,
          fromState,
          signal,
          isCurrentNav,
          emitLeaveApproveCallback,
        );

        if (guardCompletion !== undefined) {
          // The plan IS the `NavigationContext` (a superset of it), so the
          // second literal this used to build is gone — one bag per navigation.
          return this.#finishAsyncNavigation(
            guardCompletion,
            plan,
            controller,
            myId,
          );
        }

        if (!isCurrentNav()) {
          throw new RouterError(errorCodes.TRANSITION_CANCELLED);
        }

        this.#inFlight.release(controller, false);
      }

      // #1169 commit-gate — refuse to commit a navigation cancelled or
      // terminated during a listener window, BEFORE `completeTransition`'s
      // setState. The FSM table (D-full) already prevents the forceState
      // resurrection; this prevents the state commit that precedes the emit.
      // Gated on `suspendable` so the pure sync hot path pays nothing. A
      // `stop()`/`dispose()` from the listener lands the FSM in IDLE/DISPOSED
      // (caught by `!isActive()`); an external `opts.signal` abort is caught
      // directly. No supersession check: a reentrant navigate() (the only thing
      // that could bump the token synchronously) is banned
      // (REENTRANT_NAVIGATION, §4), so on this sync path the token still holds — async
      // supersede is caught in `#finishAsyncNavigation`'s `isCurrentNav`.
      if (suspendable && (!deps.isActive() || opts.signal?.aborted === true)) {
        throw new RouterError(errorCodes.TRANSITION_CANCELLED);
      }

      const finalState = completeTransition(deps, plan);

      // A bare `State`, not `Promise.resolve(state)` — the RETURN TYPE is what
      // announces "this navigation already settled, synchronously", which used
      // to be `lastSyncResolved`'s job. The ordering hazard the flag carried is
      // gone with it: there is no window in which a value says "resolved" while
      // `completeTransition` may still throw, because the value only exists once
      // it returned. The Promise wrap moves up to the facade, which owes callers
      // `Promise<State>`; the allocation is the same one, one frame higher.
      return finalState;
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
      this.#inFlight.isCurrent(myId) &&
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
      // emptying the finally only skips the controller release, which is unobservable
      // (defense-in-depth: on a CANCEL the FSM CANCEL action already aborted+nulled
      // the controller via abortCurrentController, RFC §5; the success-path
      // ref-release is proven unobservable — see InFlightNavigation.release's disable). It
      // cannot be inline-`Stryker disable`d: the catch `}` and finally `{` share one
      // line, so there is no comment position that targets the finally body. Left documented.
    } finally {
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — listener cleanup is redundant: the per-navigation signal is discarded on completion, so skipping the removeEventListener leaks nothing observable.
      if (onExternalAbort) {
        // Stryker disable next-line StringLiteral: equivalent — cleanup event name is redundant (listener is `{ once: true }` and the signal is discarded), so a wrong name removes nothing observable.
        externalSignal?.removeEventListener("abort", onExternalAbort);
      }

      // Detach the abort-race listener before the release below aborts the
      // controller below, so the cleanup abort cannot re-fire it. `undefined`
      // only when the controller was already aborted at setup (the early-resolve
      // branch above registered no listener).
      if (onInternalAbort) {
        controller.signal.removeEventListener("abort", onInternalAbort);
      }

      // Success drops the controller without aborting (the subscribeLeave signal
      // must stay unaborted); cancel/error aborts it with the originating reason
      // so captured signals expose the real cause via `signal.reason` (#943).
      this.#inFlight.release(controller, !succeeded, failureReason);
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
      this.#inFlight.release(controller, true, error);
    }

    if (transitionStarted && toState) {
      routeTransitionError(this.#deps, error, toState, fromState);
    }
  }

  /**
   * The leave phase for a navigation with no guards, but with something that
   * can suspend it. Takes the `plan` whole rather than six projections of it:
   * every argument it used to receive was a field of that same bag, and the bag
   * IS a `NavigationContext`, so handing it straight to `#finishAsyncNavigation`
   * keeps this arc at ONE context object per navigation — the allocation
   * neutrality the extracted prologue was supposed to buy everywhere, not only
   * on the guard path.
   */
  #handleNoGuardsLeave(plan: NavigationPlan): Promise<State> | undefined {
    const deps = this.#deps;
    const { toState, fromState, myId } = plan;

    deps.sendLeaveApprove(toState, fromState);

    if (deps.hasLeaveListeners()) {
      const controller = new AbortController();

      // Adopted BEFORE listeners run so a reentrant navigate() / stop() /
      // dispose() from a sync listener aborts THIS leave signal — parity with
      // the guard path (#722).
      this.#inFlight.adopt(controller);

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
        this.#inFlight.release(controller, true, error);

        throw error;
      }

      if (leaveResult !== undefined) {
        return this.#finishAsyncNavigation(leaveResult, plan, controller, myId);
      }

      // Sync listeners settled. A synchronous reentrant navigate() can no longer
      // supersede here (banned, RFC §4), so the leave always succeeds: release the
      // controller WITHOUT aborting (the subscribeLeave signal must stay live).
      this.#inFlight.release(controller, false);

      return undefined;
    }

    // No leave listeners: nothing synchronous could have superseded this
    // navigation during the LEAVE_APPROVE emit (reentrant navigate is banned).
    return undefined;
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
