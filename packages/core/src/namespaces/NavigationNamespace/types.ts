// packages/core/src/namespaces/NavigationNamespace/types.ts

import type {
  GuardFn,
  NavigationOptions,
  AnyOptions,
  Params,
  RouterLogger,
  SearchParams,
  State,
} from "../../types";

declare const COMMIT_PERMIT: unique symbol;

/**
 * Proof that the table was asked, and that it was asked FIRST (#1649).
 *
 * The post-leave cleanup in `completeTransition` is DESTRUCTIVE — it unregisters
 * the departing route's external `canDeactivate` — so it is legitimate only for
 * a navigation the table has already agreed to commit. That ordering has been
 * got wrong twice: once in review (the #1641 BLOCKER, where the clear ran ahead
 * of any verdict) and once in the #1649 write-up, which prescribed keeping the
 * single surviving ask BELOW the cleanup. Both are the same mistake, and its
 * cost is silent: a refused navigation eats the guard of the route the user
 * stays on, and the app's unsaved-changes dialog stops existing.
 *
 * So the ordering is expressed in the types rather than in a comment. The clear
 * demands a permit, the permit exists only as the ask's return value, and a
 * `const` cannot be read above its own declaration — putting the ask back below
 * the cleanup is `TS2448`, not a test failure. The symbol is never exported, so
 * the brand cannot be forged outside this module.
 *
 * ⚠ It proves the ask HAPPENED, not that it is still true. That is sufficient
 * here and nowhere else by default: nothing runs between the ask and the clear
 * — the cleanup is `Map` bookkeeping over the compiled forms #1649 stored, so
 * no code exists that could invalidate the verdict in between. What makes that
 * hold is a SECOND ordering rule the permit does not express: the one step that
 * runs application code, `buildTransitionMeta` reading the caller's `opts`
 * accessors, is hoisted ABOVE the ask. Built below it, a getter calling
 * `stop()` / `dispose()` invalidated the verdict and the send became a silent
 * table no-op while `completeTransition` still returned its state — the phantom
 * resolve, pinned by `commit-ask-snapshot-1649.test.ts`. Reuse the permit
 * across anything that CAN run user code and it would be theatre.
 */
export interface CommitPermit {
  readonly [COMMIT_PERMIT]: true;
}

/**
 * The one permit in the process. The brand is erased at runtime, so it carries
 * no information — its whole job is to exist only where the ask has already
 * answered yes. Module-level because it is a token, not a value: a fresh object
 * per navigation would allocate on the #307 hot path for nothing.
 */
export const COMMIT_PERMIT_TOKEN = {} as CommitPermit;

/**
 * ⚑ **There is no supersession token here, and that is the point (#1664).** A
 * navigation used to carry `InFlightNavigation.#navigationId` so the pipeline
 * could ask "am I still the one in flight?", while the machine answered the very
 * same question about the very same navigation by comparing the plan it had
 * adopted. Two counters for one fact, and they could disagree — the plan object
 * is now the only identity, and the pipeline asks the machine through
 * {@link NavigationDependencies.isCurrentNavigation}.
 */
export interface NavigationContext {
  toState: State;
  fromState: State | undefined;
  opts: NavigationOptions;
  toDeactivate: string[];
  toActivate: string[];
  intersection: string;
  canDeactivateFunctions: Map<string, GuardFn>;
  /**
   * ⚑ **The navigation owns its `AbortController`, and the machine owns the
   * navigation (#1684).** Ownership is therefore TRANSITIVE, with no second
   * slot to keep in step: the `CANCEL` action reads `ctx.inflight.controller`
   * off the very object it adopted on `NAVIGATE`, so "which controller is
   * current" is derived from identity rather than tracked beside it — the same
   * move that retired the supersession token above.
   *
   * Optional because allocating one is CONDITIONAL and stays that way: the
   * guard branch allocates unconditionally, the guard-free leave arc only when
   * there are leave listeners, and разрез А allocates none at all. A `take()`
   * that filled this slot for every navigation is the regression Step 1b of
   * #1588 refused by measurement — still pinned by
   * `controller-allocation.test.ts`.
   *
   * Declared here rather than on {@link NavigationPlan} so ONE declaration
   * serves both signatures: `finishAsyncNavigation` is typed by the context and
   * the plan extends it.
   */
  controller?: AbortController | undefined;
  /**
   * Drops the listener that routes the caller's `opts.signal` onto FSM `CANCEL`
   * (#1684). Present only while that bridge is standing, i.e. only for a
   * navigation that was given a signal.
   *
   * A closure rather than the handler itself, so the `signal` it was registered
   * on is captured with it — the settle sites detach without having to re-derive
   * which signal this navigation was carrying.
   */
  detachExternalBridge?: (() => void) | undefined;
  /**
   * The caller's `opts.signal`, read ONCE at the entry point and kept here
   * (#1690).
   *
   * The bridge onto it is registered at one of two moments — before the
   * announce when something in the announce or the leave dispatch can abort,
   * and after the walk is planned when only guards can — so the second site
   * needs the same signal OBJECT the first would have used. Re-reading
   * `opts.signal` there is not equivalent: `opts` may be accessor- or
   * Proxy-backed, so a second read can hand back a different object, and the
   * bridge would then be detached from something it was never attached to.
   */
  externalSignal?: AbortSignal | undefined;
}

/**
 * Everything a navigation works out BEFORE any guard runs, in one bag.
 *
 * A superset of {@link NavigationContext}, so the same object is handed to
 * `completeTransition` / `#finishAsyncNavigation` at the end instead of a second
 * literal being built there — the allocation count per navigation is unchanged
 * (one), which is why this is a refactor and not a hot-path regression.
 *
 * Filled in two passes across the FSM's `TRANSITION_START` emit, because the
 * order is observable: `suspendable` must be read BEFORE the pre-commit listener
 * windows (#1169 — a listener's `stop()` empties the listener lists), while the
 * guard maps must be read AFTER, since a `TRANSITION_START` listener may still
 * register a guard. The fields of the second pass therefore start as write-once
 * placeholders.
 */
export interface NavigationPlan extends NavigationContext {
  /** Whether a synchronous supersede is reachable at all (#1169 commit-gate). */
  suspendable: boolean;
  /**
   * `opts.forceDeactivate`, read ONCE at the entry point (#1690).
   *
   * It belongs to the first pass for the same reason `externalSignal` does:
   * `opts` may be accessor- or Proxy-backed, so reading it is a call into
   * application code, and `planPhases` — which is the only consumer — runs
   * AFTER the announce. Leaving the read there put application code inside the
   * one window the bridge's late registration assumes is empty, and a getter
   * that aborted the signal from inside it reached nobody. Measured on that
   * shape before the hoist: no `TRANSITION_CANCEL`, `isLeaveApproved()` stuck
   * true — the #1684 symptom, on the arc where `opts` is exotic.
   */
  forceDeactivate: boolean;
  canActivateFunctions: Map<string, GuardFn>;
  shouldDeactivate: boolean;
  shouldActivate: boolean;
  hasGuards: boolean;
}

/**
 * Dependencies injected into NavigationNamespace.
 *
 * These are function references from other namespaces/facade,
 * avoiding the need to pass the entire Router object.
 */
/**
 * INTERNAL options for `navigateToNotFound`. Not on the public facade — the
 * only opt-out is `replace()`'s revalidation, which is core calling core.
 */
export interface NotFoundOptions {
  /**
   * Commit without asking the current route's `canDeactivate` guards (#1643).
   * Legal only where asking would be WRONG, not merely redundant; both call
   * sites carry the reason inline.
   */
  skipDeactivation?: boolean | undefined;
}

export interface NavigationDependencies {
  /** Per-router logger instance (from `getInternals(router).logger`) */
  logger: RouterLogger;

  /** Get router options */
  // The erased view: these namespaces READ configuration (`defaultRoute`
  // truthiness, `allowNotFound`) — they never resolve a callback, which is
  // `resolveDefault`'s job. Taking `AnyOptions` keeps the dependency-map
  // generic out of every namespace that has no use for it.
  getOptions: () => AnyOptions;

  /** Check if route exists */
  hasRoute: (name: string) => boolean;

  /**
   * The route's DECLARED query-param names — the same registry the URL build
   * prints from (#1556), minus path slots. Feeds the always-on channel guard
   * (#1572); read here rather than re-derived, so classification cannot drift.
   */
  getQueryParams: (name: string) => readonly string[];

  /**
   * Per-segment param-source map for a route name (`{ segment: { param: "url" |
   * "query" } }`), read from the live matcher — the ownership channel for
   * `getTransitionPath` (RFC-4 M2 / #1548, replaced the removed `stateMetaStore`
   * WeakMap). `undefined` when the name is not in the tree.
   */
  getMetaForState: (
    name: string,
  ) => Record<string, Record<string, "url" | "query">> | undefined;

  /** Get current state */
  getState: () => State | undefined;

  /**
   * May the router LEAVE the committed state? Deactivation guards only — the
   * 404 has no route to activate.
   *
   * Routed through `RouteLifecycleNamespace.canNavigateTo` with an empty
   * activate list rather than walking the guard Maps here, so there is ONE
   * synchronous guard policy and `navigateToNotFound` cannot drift from
   * `canNavigateTo` (async guard → `false`, throwing guard → `false` + a
   * `logger.warn`).
   */
  canDeactivateCurrent: (
    deactivated: string[],
    toState: State,
    fromState: State,
  ) => boolean;

  /** Build complete navigate state: forwardState + route check + buildPath + makeState in one step */
  buildNavigateState: (
    routeName: string,
    routeParams: Params,
    routeSearch?: SearchParams,
  ) => State | undefined;

  /**
   * Resolve the `defaultRoute` / `defaultParams` / `defaultSearch` options
   * (each a static value or a callback). Two channels, never one bag — the
   * default route may be chosen dynamically, so its query defaults have to
   * travel in their own slot rather than be re-channelled downstream
   * (RFC-4 M2 / #1548).
   */
  resolveDefault: () => { route: string; params: Params; search: SearchParams };

  /**
   * Announce the transition: send NAVIGATE to the router FSM with the PLAN as
   * the payload, so the machine adopts the plan object as the navigation it is
   * carrying (#1648). Nothing is read back — the identity IS the object.
   *
   * **Returns whether the edge actually fired.** `false` means user code drove
   * the machine out of the transition band between `canNavigate()` and this
   * call (a `stop()` from a `forwardState` interceptor is the shipped way), so
   * the navigation was never announced and must not proceed.
   */
  startTransition: (plan: NavigationPlan) => boolean;

  /**
   * Is `nav` still the navigation the machine is carrying? The pipeline's ONLY
   * question about identity, and the answer is a boolean — the identity never
   * leaves the machine, so there is nothing to stamp a send with (#1648/#1664).
   *
   * Answers `false` for a navigation that has been superseded AND for one that
   * has already committed (`COMPLETE` clears the slot). Every caller pairs it
   * with a liveness question of its own (`isActive` / `isTransitioning` / the
   * controller's `aborted`), which is what makes the two agree everywhere the
   * token used to be asked.
   */
  isCurrentNavigation: (nav: object) => boolean;

  /**
   * Commit a state that is NOT the product of a navigation, through the FSM
   * `SYSTEM_COMMIT` action (write + announce in one table fact). Throws when the
   * machine has no edge to take — `ROUTER_DISPOSED` only if it actually IS
   * disposed, otherwise `ROUTER_NOT_STARTED` with the phase in the message
   * (#1644 / #1647). The edge lives on `READY` alone, so this refuses live
   * routers too.
   */
  systemCommit: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;

  /**
   * Cancel the in-flight navigation via the FSM `CANCEL` event. The `CANCEL`
   * action aborts the current controller (with `reason`, if given — surfaces as
   * the leave signal's `reason`, #943) and emits `TRANSITION_CANCEL`. No-op when
   * nothing is cancellable.
   */
  cancelNavigation: (reason?: unknown) => void;

  /**
   * ask-half of the commit — same table row as {@link sendTransitionDone}.
   *
   * Returns a {@link CommitPermit} rather than `true` so the destructive work
   * downstream can DEMAND it; `undefined` is the refusal.
   */
  canCommitTransition: (payload: NavigationContext) => CommitPermit | undefined;
  sendTransitionDone: (payload: NavigationContext) => void;

  /**
   * Send FAIL event to routerFSM, naming the navigation the report belongs to,
   * so the table can refuse one from a navigation that has already been
   * superseded. The name is the plan OBJECT — the same one the machine adopted
   * on NAVIGATE — so there is no stamp to get wrong (#1648).
   */
  sendTransitionFail: (
    fromState: State | undefined,
    error: unknown,
    nav: object,
  ) => void;

  /** Emit TRANSITION_ERROR event to listeners */
  emitTransitionError: (
    toState: State | undefined,
    fromState: State | undefined,
    error: unknown,
  ) => void;

  /** Send LEAVE_APPROVE event to routerFSM and emit to listeners */
  sendLeaveApprove: (plan: NavigationPlan) => void;

  /** Check if navigation can begin (router is started) */
  canNavigate: () => boolean;

  /**
   * Is the machine still in STARTING, i.e. inside the boot window (#1647)? Read
   * ONLY to pick which cached not-started rejection to hand back — the refusal
   * itself is already decided by `canNavigate()` above, so this can never widen
   * it. The boot never reaches that branch: `completeStart()` leaves STARTING
   * before it navigates, so for the boot `canNavigate()` is true.
   */
  isStarting: () => boolean;

  /** Get lifecycle functions (canDeactivate, canActivate maps) */
  getLifecycleFunctions: () => [Map<string, GuardFn>, Map<string, GuardFn>];

  /** Check if router is active (for cancellation check on stop()) */
  isActive: () => boolean;

  /** Check if a transition is currently in progress */
  isTransitioning: () => boolean;

  /**
   * Clear canDeactivate guard for a route — DESTRUCTIVE, hence the permit
   * ({@link CommitPermit}): it is only legitimate once the table has agreed to
   * the commit, and the parameter is what makes "ask first" unrepresentable
   * rather than remembered.
   */
  clearCanDeactivate: (name: string, permit: CommitPermit) => void;

  /** Check if any leave listeners are registered */
  hasLeaveListeners: () => boolean;

  /** Any pre-commit transition listener (onTransitionStart / onTransitionLeaveApprove) — #1169 gate */
  hasPreCommitListeners: () => boolean;

  /** Call all leave listeners — returns Promise if any are async, undefined otherwise */
  awaitLeaveListeners: (
    toState: State,
    fromState: State | undefined,
    signal: AbortSignal,
  ) => Promise<void> | undefined;
}
