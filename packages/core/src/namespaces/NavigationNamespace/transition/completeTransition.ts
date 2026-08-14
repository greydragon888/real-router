import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State, TransitionMeta } from "../../../types";
import type { NavigationDependencies, NavigationContext } from "../types";

type MutableTransitionMeta = {
  -readonly [K in keyof TransitionMeta]: TransitionMeta[K];
};

/**
 * Built entirely from the PLAN: the three flags were snapshotted at the entry
 * (#1719), so nothing here reads the caller's `NavigationOptions`.
 */
function buildTransitionMeta(nav: NavigationContext): TransitionMeta {
  const { fromState, toDeactivate, toActivate, intersection } = nav;

  Object.freeze(toDeactivate);
  Object.freeze(toActivate);

  const segments = Object.freeze({
    deactivated: toDeactivate,
    activated: toActivate,
    intersection,
  });

  const meta: MutableTransitionMeta = {
    phase: "activating",
    reason: "success",
    segments,
  };

  if (fromState?.name !== undefined) {
    meta.from = fromState.name;
  }

  if (nav.reload !== undefined) {
    meta.reload = nav.reload;
  }

  if (nav.replace !== undefined) {
    meta.replace = nav.replace;
  }

  if (nav.redirected !== undefined) {
    meta.redirected = nav.redirected;
  }

  return Object.freeze(meta);
}

export function completeTransition(
  deps: NavigationDependencies,
  nav: NavigationContext,
): State {
  const { toState, fromState, toDeactivate, toActivate } = nav;

  if (
    toState.name !== constants.UNKNOWN_ROUTE &&
    !deps.hasRoute(toState.name)
  ) {
    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
      routeName: toState.name,
    });

    deps.sendTransitionFail(fromState, err, nav);

    throw err;
  }

  // ⚑ No literal: the navigation's own context IS the commit payload (#1648) —
  // it is the object the machine adopted on NAVIGATE, so `mayCommit` recognises
  // it by reference, and building a second one here is what used to force the
  // caller to copy an identity into it by hand. It carries `opts` UNSTRIPPED;
  // sanitising that for SUBSCRIBERS is the announcement's job, in the action.
  const commit = nav;

  // ⚑ **This function reads no `opts` field at all, which is what makes the
  // window between the ask and the send empty STRUCTURALLY** rather than by
  // care: the meta used to be built out of the CALLER's accessor- or
  // Proxy-backed object (`navigate/edge-cases-proxy` pins three such getters),
  // so a getter calling `stop()` under it invalidated a verdict already given —
  // `COMPLETE` found no edge, the send was a silent no-op, and `navigate()`
  // resolved a state nobody committed (#1719).
  //
  // ⚠ Not "no application code runs in `completeTransition`" — the ANNOUNCE
  // below the verdict runs plenty, synchronously into every plugin hook and
  // every `router.subscribe` listener, and so does the `ROUTE_NOT_FOUND` arm
  // above. The claim is narrower: between the ask and the send there is
  // bookkeeping and nothing else.
  (toState as { transition: TransitionMeta }).transition =
    buildTransitionMeta(nav);

  // `Object.freeze` returns its argument, so `finalState` IS `commit.toState` —
  // one object, no second literal on the #307 hot path.
  const finalState = Object.freeze(toState);

  // ONE ask, unconditional, and it stands HERE: after the last application code,
  // before the post-leave cleanup, with nothing but bookkeeping between it and
  // the send (RFC-10a §7.4). The cleanup below is DESTRUCTIVE — it unregisters
  // the departing route's external `canDeactivate` — so a cancelled navigation
  // must not reach it and eat the guard of the route the user is STAYING on.
  // Measured with the type defeated to get there: an ask below the loop reds 16
  // tests across five files. The two conditions look mutually exclusive (a
  // non-empty cleanup means the departing route HAS a guard, and such a
  // navigation is fenced long before the commit) — `forceDeactivate` is what
  // separates them, skipping the deactivate PHASE while `planPhases` still
  // fills `canDeactivateFunctions`.
  //
  // ⚑ The ordering is the TYPE's job, not this comment's: the ask hands back a
  // `CommitPermit` and the clear below demands one, so moving it down is
  // `TS2448` rather than a red test — a lock earned by making the mistake twice.
  const permit = deps.canCommitTransition(commit);

  if (!permit) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  // No `fromState` / `hasSlotToClear` gate: with `fromState === undefined`
  // `computeTransitionPath` returns the frozen empty `toDeactivate`
  // (`transitionPath.ts:343-349`), so the loop is already a no-op there, and
  // the pre-scan existed only to keep the now-deleted second `canSend` off the
  // common path.
  for (const name of toDeactivate) {
    if (toActivate.includes(name) || !nav.canDeactivateFunctions.has(name)) {
      continue;
    }

    deps.clearCanDeactivate(name, permit);
  }

  // ⚠ Reading the verdict from the effect instead ("did `getState()` become my
  // state?") looks cleaner and is WRONG — measured, not reasoned: a `subscribe`
  // listener may legitimately `replace()` during the success emit, which commits
  // a different state on top. That is a successful commit followed by another
  // one, and identity cannot tell it from a refusal.
  deps.sendTransitionDone(commit);

  return finalState;
}
