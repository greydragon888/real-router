import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State, TransitionMeta } from "../../../types";
import type { NavigationDependencies, NavigationContext } from "../types";

type MutableTransitionMeta = {
  -readonly [K in keyof TransitionMeta]: TransitionMeta[K];
};

/**
 * Built entirely from the PLAN — no argument of this function comes from
 * anywhere else, and that is the point (#1719). Its three flags used to be read
 * off the caller's `NavigationOptions`, which is accessor- or Proxy-backed by
 * contract, so building the meta was a call into application code from inside
 * the commit. The entry point snapshots them before it announces anything.
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

  // ⚠ The payload carries `opts` UNSTRIPPED, signal and all — sanitising them
  // for SUBSCRIBERS is the announcement's job and happens in the action. It
  // used to be the TABLE's constraint too ("`mayCommit` reads the external
  // signal from it"), and that is exactly what #1717 removed: the gate and the
  // announcement's strip branch both ask `nav.externalSignal`, the snapshot the
  // entry took, so neither depends on what a second read of the caller's object
  // would say. What is left here is the plugins' contract, not the gate's.
  //
  // `Object.freeze` returns its argument, so `commit.toState` IS the object
  // that gets its `transition` attached and frozen further down — one object,
  // no second literal on the #307 hot path. (It was asked TWICE here until
  // #1649, which is why this note used to say so; there is one ask now.)
  // ⚑ No literal: the navigation's own context IS the commit payload (#1648).
  // It already carries `toState` / `fromState` / `opts`, and — the part that
  // matters — it is the object the machine adopted on NAVIGATE, so `mayCommit`
  // recognises it by reference. Building a second object here is what used to
  // force the caller to copy an identity into it by hand.
  const commit = nav;

  // The meta and the freeze still stand above the ask, but they are no longer
  // KEPT there by an ordering rule — there is nothing left below to order them
  // against (#1719).
  //
  // ⚑ **This function reads no `opts` field at all now, and that is what makes
  // the window between the ask and the send empty STRUCTURALLY.** It used to
  // build the meta out of `opts.reload` / `opts.replace` / `opts.redirected` —
  // the CALLER's object, accessor- or Proxy-backed by contract
  // (`navigate/edge-cases-proxy` pins three of them) — so this was the one place
  // in `completeTransition` that ran application code, and it had to run BEFORE
  // the verdict: a getter calling `stop()` / `dispose()` under it invalidated a
  // verdict already given, `COMPLETE` then hit a table with no such edge, the
  // send was a silent no-op, and this function still returned `finalState` —
  // `navigate()` resolving a state nobody committed, with no
  // `TRANSITION_SUCCESS` and a `getState()` that disagrees. The three flags are
  // snapshotted at the entry now (`NavigationContext.reload` and its two
  // siblings), so a getter cannot reach this frame at all.
  //
  // ⚠ **Not "no application code runs in `completeTransition`" — that is false
  // and the difference matters.** The ANNOUNCE below the verdict runs plenty:
  // `sendTransitionDone` emits `TRANSITION_SUCCESS` synchronously into every
  // plugin hook and every `router.subscribe` listener, and the `ROUTE_NOT_FOUND`
  // arm above does the same through `sendTransitionFail`. Both stand BELOW the
  // verdict and were never what the rule was about. The exact claim is: between
  // the ask and the send there is bookkeeping and nothing else.
  (toState as { transition: TransitionMeta }).transition =
    buildTransitionMeta(nav);

  const finalState = Object.freeze(toState);

  // ask, then fire — ONE ask, unconditional, and it stands HERE: after the last
  // application code, before the post-leave cleanup, with nothing but
  // bookkeeping between it and the send (RFC-10a §7.4).
  //
  // There were two until #1649, and the pair was not redundancy. The cleanup
  // below is DESTRUCTIVE — it unregisters the departing route's external
  // `canDeactivate` — so a verdict was needed BEFORE it (a cancelled navigation
  // must not eat the guard of the route the user is STAYING on, the #1641
  // review BLOCKER); and the cleanup used to RUN APPLICATION CODE, because
  // clearing a guard recompiled the slot by invoking the surviving definition
  // factory, so a second verdict was needed AFTER it to see what that factory
  // had done (#1611 / #1626). #1649 removed the second reason at the root:
  // `#recompileSlot` reads a stored compiled function now, so the cleanup is
  // pure bookkeeping and cannot supersede, terminate or renavigate anything.
  //
  // ⚠ The surviving ask had to move ABOVE the cleanup, and that is the one
  // thing that is NOT interchangeable — measured, not reasoned. Keeping it in
  // the old §16.7 position (after the cleanup) reds
  // `commit-gate-1169 › an aborted opts.signal leaves the external
  // canDeactivate registered`: the cleanup is still destructive even when it is
  // silent, so a refusal that arrives after it is still too late. "Before" and
  // "after" did not become one point; only the SECOND ask lost its subject.
  //
  // ⚑ That ordering is now the TYPE's job, not this comment's: the ask hands
  // back a `CommitPermit`, the clear below demands one, and a `const` cannot be
  // read above its declaration — so moving the ask back down is `TS2448`
  // instead of a red test. The mistake has been made twice (#1641's review, and
  // the #1649 write-up itself), which is what earned it a compile-time lock.
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
