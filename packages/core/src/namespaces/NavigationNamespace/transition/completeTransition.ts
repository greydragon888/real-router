import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { NavigationOptions, State, TransitionMeta } from "../../../types";
import type { NavigationDependencies, NavigationContext } from "../types";

type MutableTransitionMeta = {
  -readonly [K in keyof TransitionMeta]: TransitionMeta[K];
};

function buildTransitionMeta(
  fromState: State | undefined,
  opts: NavigationOptions,
  toDeactivate: string[],
  toActivate: string[],
  intersection: string,
): TransitionMeta {
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

  if (opts.reload !== undefined) {
    meta.reload = opts.reload;
  }

  if (opts.replace !== undefined) {
    meta.replace = opts.replace;
  }

  if (opts.redirected !== undefined) {
    meta.redirected = opts.redirected;
  }

  return Object.freeze(meta);
}

/**
 * Would the post-leave cleanup below unregister anything?
 *
 * The same predicate the loop applies, asked first so the commit can be put to
 * the table BEFORE the destructive part rather than only after it. Separate
 * function so the ask reads as one decision instead of a flag threaded through
 * a loop body.
 */
function hasSlotToClear(
  nav: NavigationContext,
  toDeactivate: string[],
  toActivate: string[],
): boolean {
  for (const name of toDeactivate) {
    if (!toActivate.includes(name) && nav.canDeactivateFunctions.has(name)) {
      return true;
    }
  }

  return false;
}

export function completeTransition(
  deps: NavigationDependencies,
  nav: NavigationContext,
): State {
  const { toState, fromState, opts, toDeactivate, toActivate, intersection } =
    nav;

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

  // ⚠ The payload carries `opts` UNSTRIPPED, signal and all. `mayCommit` reads
  // the external signal from it, so stripping here would make that clause
  // inert — measured: with the signal removed before the send, the condition
  // never sees an abort and the QD arc (an `opts.signal` aborted from a sync
  // `subscribeLeave`) walks straight through. Sanitising for SUBSCRIBERS is the
  // announcement's job and happens in the action.
  //
  // Built BEFORE the post-leave cleanup so the same payload can be asked twice
  // (below). `Object.freeze` returns its argument, so `commit.toState` IS the
  // object that gets its `transition` attached and frozen further down — one
  // object, two asks, no second literal on the #307 hot path.
  // ⚑ No literal: the navigation's own context IS the commit payload (#1648).
  // It already carries `toState` / `fromState` / `opts`, and — the part that
  // matters — it is the object the machine adopted on NAVIGATE, so `mayCommit`
  // recognises it by reference. Building a second object here is what used to
  // force the caller to copy an identity into it by hand.
  const commit = nav;

  // ⚑ Ask BEFORE the post-leave cleanup, not only after it. That cleanup is
  // DESTRUCTIVE — it unregisters the departing route's external `canDeactivate`
  // — and it is only legitimate for a navigation that is actually going to
  // commit. The #1169 commit-gate used to stand in `executeNavigation`, i.e.
  // BEFORE this function was entered at all, so a cancelled navigation never
  // reached the loop; absorbing that gate into `when: mayCommit` moved the
  // verdict to AFTER it and let a cancelled navigation eat the guard of the
  // route the user is STAYING on (measured A/B against `4c3b95424`: with an
  // `opts.signal` aborted from a sync `subscribeLeave` listener, the next
  // `navigate` away was refused on base and went through here).
  //
  // Gated on there being a slot to clear, so a navigation with nothing to
  // unregister — the common case — pays one walk of a 1–3 element array and no
  // `canSend` at all.
  if (fromState && hasSlotToClear(nav, toDeactivate, toActivate)) {
    if (!deps.canCommitTransition(commit)) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    for (const name of toDeactivate) {
      if (toActivate.includes(name) || !nav.canDeactivateFunctions.has(name)) {
        continue;
      }

      deps.clearCanDeactivate(name);
    }

    // ⚑ The interim guard that used to stand here (#1611 + #1626) is GONE,
    // absorbed exactly as its own marker predicted. Both of its halves are now
    // one table fact on the COMPLETE edge: a superseded navigation is no longer
    // the object in `ctx.inflight` (the nested NAVIGATE replaced it), and a
    // terminated router has no COMPLETE edge at all. The user code that made
    // the guard necessary — the definition factory recompiled just above —
    // still runs here; what changed
    // is that the verdict is no longer asked BEFORE the write, because there is
    // no separate write left to run ahead of it. That is why the ask below stays
    // where it is: it is the one that has to see what the factory just did.
  }

  (toState as { transition: TransitionMeta }).transition = buildTransitionMeta(
    fromState,
    opts,
    toDeactivate,
    toActivate,
    intersection,
  );

  const finalState = Object.freeze(toState);

  // ask, then fire — both read the SAME table row, one after the other, with no
  // user code in between (RFC-10a §7.4). The ask is what tells THIS navigation
  // whether it may resolve; the fire is what writes and announces.
  //
  // ⚠ Reading the verdict from the effect instead ("did `getState()` become my
  // state?") looks cleaner and is WRONG — measured, not reasoned: a `subscribe`
  // listener may legitimately `replace()` during the success emit, which commits
  // a different state on top. That is a successful commit followed by another
  // one, and identity cannot tell it from a refusal.
  if (!deps.canCommitTransition(commit)) {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  deps.sendTransitionDone(commit);

  return finalState;
}
