import { throwIfDisposed } from "./helpers";
import { getInternals } from "../internals";

import type { LifecycleApi } from "./types";
import type { DefaultDependencies, Router } from "../public-types";

export function getLifecycleApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): LifecycleApi<Dependencies> {
  const ctx = getInternals(router);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const lifecycleNamespace = ctx.routeGetStore().lifecycleNamespace!;

  return {
    addActivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.routes.validateRouteName(name, "addActivateGuard");
      ctx.validator?.lifecycle.validateHandler(handler, "addActivateGuard");

      // Handler-limit enforcement lives at the namespace registration choke point
      // (RouteLifecycleNamespace.#registerHandler) so all paths are bounded
      // uniformly — see #961.
      lifecycleNamespace.addCanActivate(name, handler);
    },

    addDeactivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.routes.validateRouteName(name, "addDeactivateGuard");
      ctx.validator?.lifecycle.validateHandler(handler, "addDeactivateGuard");

      lifecycleNamespace.addCanDeactivate(name, handler);
    },

    removeActivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.routes.validateRouteName(name, "removeActivateGuard");

      // Inverse of addActivateGuard (external): clears only the external guard;
      // a route-config (definition) canActivate survives (#1171).
      lifecycleNamespace.clearCanActivate(name, "external");
    },

    removeDeactivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.routes.validateRouteName(name, "removeDeactivateGuard");

      // Inverse of addDeactivateGuard (external): clears only the external guard;
      // a route-config (definition) canDeactivate survives (#1171).
      lifecycleNamespace.clearCanDeactivate(name, "external");
    },
  };
}
