import { assertRouteNameIsString } from "../guards";
import {
  getInternals,
  POSITION,
  runChecks,
  throwIfDisposed,
} from "../internals";

import type { LifecycleApi } from "./types";
import type { DefaultDependencies, Router } from "../types";

export function getLifecycleApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): LifecycleApi<Dependencies> {
  const ctx = getInternals(router);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const lifecycleNamespace = ctx.routeGetStore().lifecycleNamespace!;

  return {
    addActivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      assertRouteNameIsString(name, "addActivateGuard");
      runChecks(ctx.checks, POSITION["addActivateGuard:entry"], name, handler);

      // Handler-limit enforcement lives at the namespace registration choke point
      // (RouteLifecycleNamespace.#registerHandler) so all paths are bounded
      // uniformly — see #961.
      // `false` — the EXTERNAL lane, named rather than defaulted (#1977).
      lifecycleNamespace.addCanActivate(name, handler, false);
    },

    addDeactivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      assertRouteNameIsString(name, "addDeactivateGuard");
      runChecks(
        ctx.checks,
        POSITION["addDeactivateGuard:entry"],
        name,
        handler,
      );

      lifecycleNamespace.addCanDeactivate(name, handler, false);
    },

    removeActivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      assertRouteNameIsString(name, "removeActivateGuard");
      runChecks(ctx.checks, POSITION["removeActivateGuard:entry"], name);

      // Inverse of addActivateGuard (external): clears only the external guard;
      // a route-config (definition) canActivate survives (#1171).
      lifecycleNamespace.clearCanActivate(name, "external");
    },

    removeDeactivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      assertRouteNameIsString(name, "removeDeactivateGuard");
      runChecks(ctx.checks, POSITION["removeDeactivateGuard:entry"], name);

      // Inverse of addDeactivateGuard (external): clears only the external guard;
      // a route-config (definition) canDeactivate survives (#1171).
      lifecycleNamespace.clearCanDeactivate(name, "external");
    },
  };
}
