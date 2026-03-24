import { throwIfDisposed } from "./helpers";
import { getInternals } from "../internals";

import type { LifecycleApi } from "./types";
import type { DefaultDependencies, Router } from "@real-router/types";

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

      lifecycleNamespace.clearCanActivate(name);
    },

    removeDeactivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.routes.validateRouteName(name, "removeDeactivateGuard");

      lifecycleNamespace.clearCanDeactivate(name);
    },
  };
}
