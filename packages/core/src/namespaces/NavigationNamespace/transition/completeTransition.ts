import { errorCodes, constants } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { NavigationDependencies, NavigationContext } from "../types";
import type {
  NavigationOptions,
  State,
  TransitionMeta,
} from "@real-router/types";

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
    for (const name of toDeactivate) {
      if (!toActivate.includes(name) && nav.canDeactivateFunctions.has(name)) {
        deps.clearCanDeactivate(name);
      }
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
