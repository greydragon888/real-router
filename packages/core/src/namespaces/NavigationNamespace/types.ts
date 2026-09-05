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
 * ⚠ The post-leave cleanup in `completeTransition` is DESTRUCTIVE — it
 * unregisters the departing route's external `canDeactivate` — so it is
 * legitimate only for a navigation the table has already agreed to commit. That
 * ordering has been got wrong twice: once in review (the #1641 BLOCKER, where
 * the clear ran ahead of any verdict) and once in the #1649 write-up, which
 * prescribed keeping the single surviving ask BELOW the cleanup. Both are the
 * same mistake, and its cost is silent: a refused navigation eats the guard of
 * the route the user stays on, and the app's unsaved-changes dialog stops
 * existing.
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
 * no code exists that could invalidate the verdict in between.
 *
 * The permit expresses no SECOND ordering rule, and needs none:
 * `completeTransition` reads no `opts` field at all
 * (`commit-window-empty-1719.test.ts` counts the getter
 * invocations — the story is told at that function and at
 * {@link NavigationContext.reload}). Reuse the permit across anything that CAN
 * run user code and it would be theatre.
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

declare const ANNOUNCED: unique symbol;

/**
 * A plan the machine has ADOPTED — the transition is announced.
 *
 * ⚑ **The brand makes "after the announce" an ARGUMENT TYPE, not a rule:**
 * `beginTransition` mints core's only `as AnnouncedPlan` (measured: 1), below
 * its `send`, and `planPhases` demands one — so an unannounced plan does not
 * compile. WHY pass 2 must be late is `planPhases`'s own fact, stated in its
 * doc.
 */
export type AnnouncedPlan = NavigationPlan & { readonly [ANNOUNCED]: true };

/**
 * ⚑ **There is no supersession token here, and that is the point (#1664).** A
 * navigation carrying a counter — an `#navigationId` or an
 * `InFlightNavigation.#id` — lets the pipeline ask "am I still the one in
 * flight?" while the machine answers the very same question about the very same
 * navigation by comparing the plan it adopted. Two counters for one fact, free
 * to disagree. The plan object is the only identity, and the machine compares it
 * by reference on the `COMPLETE` edge (`mayCommit`).
 *
 * The pipeline asks no IDENTITY question since #1734 (0 readers in `src`) — but
 * it did not collapse to ONE liveness question: the guard fence and
 * `finishAsyncNavigation` ask `!controller.signal.aborted`, while
 * `handleNavigateError` asks `deps.isTransitioning()`. That asymmetry is
 * deliberate and measured, and it is stated where it lives, above
 * `handleNavigateError`.
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
   * there are leave listeners, and cut A allocates none at all. A `take()`
   * that filled this slot for every navigation is the regression Step 1b of
   * #1588 refused by measurement — still pinned by
   * `controller-allocation.test.ts`, whose four cases include the two that are
   * suspendable and allocate NOTHING (an external signal, a pre-commit
   * listener): those are the cells the forbidden edit reds.
   *
   * Declared on the CONTEXT rather than on {@link NavigationPlan} because both
   * readers are typed by it — `openController`, the one door every allocation
   * goes through, and `handleNavigateError`, which aborts `nav?.controller` for
   * a navigation that may never have been announced. `finishAsyncNavigation` is
   * NOT one of them: it takes the controller as a parameter, from both of its
   * callers.
   */
  controller?: AbortController | undefined;
  /**
   * The reason the `CANCEL` action recorded, or `undefined` while the
   * navigation has not been cancelled (#1706).
   *
   * ⚑ **This is the cancellability SCOPE, and the controller above is only its
   * materialisation.** Because allocation is lazy, "was this navigation
   * cancelled?" and "is its signal aborted?" are not the same question in the
   * window before the first consumer opens one — and the machine can only
   * answer the first. So `handleCancel` writes here unconditionally and aborts
   * the controller only `?.`; {@link openController} then aborts on birth. A
   * flag rather than an eagerly-allocated controller precisely so cut A and
   * the born-dead arcs keep allocating nothing.
   *
   * Written by the `CANCEL` action, read only by `openController`. Never
   * cleared: a cancelled navigation does not come back.
   */
  cancelReason?: unknown;
  /**
   * Drops the listener that routes the caller's `opts.signal` onto FSM `CANCEL`
   * (#1684). Present only while that bridge is standing, i.e. only for a
   * navigation that was given a signal.
   *
   * A closure rather than the handler itself, so the `signal` it was registered
   * on is captured with it — the closer does not have to re-derive which signal
   * this navigation was carrying.
   *
   * ⚑ **It is the cancellability SCOPE's closer now, and the machine calls it —
   * every time (#1716 + #1724).** The four pipeline settle sites are gone:
   * `CANCEL`, `FAIL` and `COMPLETE` each close the scope from their action, and
   * the one call that survived in `beginTransition` — for the navigation the
   * machine never ADOPTED, which no edge would ever fire for — went with the
   * OPENING moving into the `NAVIGATE` action, since a refused edge now opens
   * nothing. The closure CLEARS THIS FIELD ITSELF, so calling it twice is a
   * no-op — see `bridgeSignal` in `EventBusNamespace`, which owns that protocol
   * and is why "no bridge standing" stays expressible as `=== undefined`.
   */
  detachExternalBridge?: (() => void) | undefined;
  /**
   * The caller's `opts.signal`, read ONCE at the entry point and kept here
   * (#1690).
   *
   * The bridge onto it is registered at one of two moments — in the `NAVIGATE`
   * edge's action when something in the announce or the leave dispatch can
   * abort (#1724), and after the walk is planned when only guards can — so the
   * second site needs the same signal OBJECT the first would have used.
   * Re-reading `opts.signal` there is not equivalent: `opts` may be accessor- or
   * Proxy-backed, so a second read can hand back a different object, and the
   * bridge would then be detached from something it was never attached to. The
   * first site reads the same snapshot off `RouterPayloads["NAVIGATE"]`, which
   * is this very field — the plan IS the payload.
   */
  externalSignal?: AbortSignal | undefined;
  /**
   * The caller's `reload` / `replace` / `redirected`, read ONCE at the entry
   * and kept here — the three inputs of `buildTransitionMeta` (#1719).
   *
   * ⚑ **They exist to empty a WINDOW, not to save a read.** Built from `opts`
   * inside `completeTransition`, the meta was the one step there that ran
   * application code, so the commit stayed sound only by an ordering RULE — one
   * got wrong twice on record. The snapshot empties that window structurally;
   * see {@link CommitPermit} for what the rule was protecting.
   *
   * Three flat slots rather than a nested record: `plan-born-in-final-shape`
   * puts every slot in the literal, and a record would allocate for an arc
   * (cut A) that has no use for it.
   *
   * ⚠ **CodSpeed reports ≈15 % on `navigate/sync-baseline` for this change, and
   * that step is the MODEL, not the clock — #1728, closed as not-planned.**
   * `cpuTotal` is a valgrind model in which this arc is gated by the COMBINED
   * bytecode of `beginTransition` + `planPhases`: slow inside 600…821 bytes,
   * fast outside, both edges found to the byte, and the snapshot added 28 and
   * crossed it. Wall-clock on the x64 runner has master FASTER by 2.9 %. So
   * there is no cost here to pay down, and any step this arc reports is worth a
   * wall-clock check before it is worth an investigation.
   *
   * ⚠ Snapshotting does NOT change what plugins receive — the announcement
   * still hands over `opts` ITSELF, because keys core never declared are a
   * shipped contract on it: `memory-plugin` round-trips its own `source` marker
   * through `navigate(...)` to `onTransitionSuccess`.
   */
  reload?: boolean | undefined;
  replace?: boolean | undefined;
  redirected?: boolean | undefined;
}

/**
 * Everything a navigation works out BEFORE any guard runs, in one bag.
 *
 * A superset of {@link NavigationContext}, so the same object is handed to
 * `completeTransition` / `finishAsyncNavigation` at the end instead of a second
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
   * First pass for the same reason {@link NavigationContext.externalSignal} is:
   * its only consumer, `planPhases`, runs AFTER the announce, so reading it
   * there put application code inside the window the bridge's late registration
   * assumes is empty. Measured before the hoist: a getter aborting the signal
   * from inside it reached nobody — no `TRANSITION_CANCEL`, `isLeaveApproved()`
   * stuck true, the #1684 symptom on an exotic `opts`.
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
  ) => State;

  /**
   * Cancel the in-flight navigation via the FSM `CANCEL` event. The `CANCEL`
   * action aborts the current controller (with `reason`, if given — surfaces as
   * the leave signal's `reason`, #943) and emits `TRANSITION_CANCEL`. No-op when
   * nothing is cancellable.
   */
  cancelNavigation: (reason?: unknown) => void;

  /**
   * Open the cancellability scope onto the caller's `opts.signal` — the LATE of
   * the bridge's two moments (#1690), the only one the pipeline still asks for.
   *
   * The EARLY one is the `NAVIGATE` edge's own action (#1724), so this
   * dependency exists for the single fact the machine cannot know when that edge
   * fires: whether THIS transition walks a guard. `planPhases` answers it only
   * after the announce, because a `TRANSITION_START` listener may still register
   * one.
   *
   * Idempotent at the far end — the implementation owns "is a bridge already
   * standing?", so the arc that reaches both moments registers once.
   */
  bridgeExternalSignal: (plan: NavigationPlan) => void;

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
