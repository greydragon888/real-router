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

    deps.sendTransitionFail(toState, fromState, err, nav.myEpoch);

    throw err;
  }

  if (fromState) {
    for (const name of toDeactivate) {
      if (toActivate.includes(name) || !nav.canDeactivateFunctions.has(name)) {
        continue;
      }

      deps.clearCanDeactivate(name);
    }

    // ⚑ The interim guard that used to stand here (#1611 + #1626) is GONE,
    // absorbed exactly as its own marker predicted. Both of its halves are now
    // one table fact on the COMPLETE edge: a superseded navigation carries a
    // FOREIGN epoch (the nested NAVIGATE bumped it), and a terminated router has
    // no COMPLETE edge at all. The user code that made the guard necessary — the
    // definition factory recompiled just above — still runs here; what changed
    // is that the verdict is no longer asked BEFORE the write, because there is
    // no separate write left to run ahead of it.
  }

  (toState as { transition: TransitionMeta }).transition = buildTransitionMeta(
    fromState,
    opts,
    toDeactivate,
    toActivate,
    intersection,
  );

  const finalState = Object.freeze(toState);

  // ⚠ The payload carries `opts` UNSTRIPPED, signal and all. `mayCommit` reads
  // the external signal from it, so stripping here would make that clause
  // inert — measured: with the signal removed before the send, the condition
  // never sees an abort and the QD arc (an `opts.signal` aborted from a sync
  // `subscribeLeave`) walks straight through. Sanitising for SUBSCRIBERS is the
  // announcement's job and happens in the action.
  const commit = {
    epoch: nav.myEpoch,
    toState: finalState,
    fromState,
    opts,
  };

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
