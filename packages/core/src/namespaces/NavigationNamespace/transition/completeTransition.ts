import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { NavigationOptions, State, TransitionMeta } from "../../../types";
import type { InFlightNavigation } from "../InFlightNavigation";
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

function stripSignal({
  signal: _,
  ...rest
}: NavigationOptions): NavigationOptions {
  return rest;
}

export function completeTransition(
  deps: NavigationDependencies,
  inFlight: InFlightNavigation,
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

    deps.sendTransitionFail(toState, fromState, err);

    throw err;
  }

  if (fromState) {
    let cleared = false;

    for (const name of toDeactivate) {
      if (toActivate.includes(name) || !nav.canDeactivateFunctions.has(name)) {
        continue;
      }

      deps.clearCanDeactivate(name);
      cleared = true;
    }

    // The one place this function runs USER code before committing (#1611).
    // Clearing the external guard recompiles the slot from a surviving
    // DEFINITION factory, and that factory is the application's: a `dispose()`
    // or `stop()` from it terminated the router one statement before `setState`,
    // and the commit landed anyway — `navigate()` resolved while `COMPLETE` from
    // `DISPOSED`/`IDLE` was a table no-op, so no subscriber was ever told. The
    // #1169 commit-gate cannot cover it: it sits BEFORE this function, i.e. on
    // the far side of that user code, and is `suspendable`-gated while this
    // reproduces on the uncancellable `completeImmediate` arc.
    //
    // Gated on `cleared` so the question is asked only when the factory could
    // actually have run — a navigation that clears nothing pays a boolean, not
    // an `isTransitioning()` call, on a path #307 counts nanoseconds on. The
    // gate is a PERF gate and behaviourally equivalent (measured: removing it
    // leaves the whole suite green — nothing ran that could change liveness),
    // the same shape as `suspendable` gating the #1169 commit-gate.
    //
    // `isTransitioning()`, not `isActive()`: the question is "is the machine
    // still inside a transition", and it is strictly the better one here. It
    // catches the reported `dispose()` (DISPOSED) and `stop()` (IDLE), and for
    // free the factory that starts a NESTED navigation which runs to completion
    // — that leaves the FSM in READY, so `isActive()` would wave it through and
    // this commit would silently overwrite the nested one's. Measured: with
    // `isActive()` the nested case commits the outer state over the inner
    // result; with this, the inner result stands.
    //
    // NEITHER half subsumes the other, which is why both are asked (#1626):
    //
    // - `isTransitioning()` catches a factory that TERMINATED the router
    //   (`dispose()` → DISPOSED, `stop()` → IDLE) and one whose nested
    //   navigation already RAN TO COMPLETION (FSM back in READY). The token is
    //   unmoved in the terminate case, so the token check alone would wave it
    //   through.
    // - `isCurrent(myId)` catches the nested navigation still IN FLIGHT: the
    //   FSM sits in ITS transition, so `isTransitioning()` is true — for
    //   somebody else — and committing here would silently overwrite a result
    //   that has not landed yet (measured before the fix: `START:a · CANCEL:a ·
    //   START:b · SUCCESS:a`, with b's result lost and `navigate()` RESOLVING).
    //
    // ⚠ Interim form; absorbed when the commit is asked THROUGH the FSM right
    // before `setState` (RFC-10a §16.7 / §9.9, plan §10 phase 3) — there the
    // supersede is a table fact (`when`/epoch), not two operational questions.
    if (cleared && (!deps.isTransitioning() || !inFlight.isCurrent(nav.myId))) {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }
  }

  (toState as { transition: TransitionMeta }).transition = buildTransitionMeta(
    fromState,
    opts,
    toDeactivate,
    toActivate,
    intersection,
  );

  const finalState = Object.freeze(toState);

  deps.setState(finalState);

  const transitionOpts = opts.signal === undefined ? opts : stripSignal(opts);

  deps.sendTransitionDone(finalState, fromState, transitionOpts);

  return finalState;
}
