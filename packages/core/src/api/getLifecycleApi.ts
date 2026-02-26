import { validateRouteName } from "type-guards";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { validateHandler } from "../namespaces/RouteLifecycleNamespace/validators";
import { RouterError } from "../RouterError";

import type { LifecycleApi } from "./types";
import type { DefaultDependencies, Router } from "@real-router/types";

function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

export function getLifecycleApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): LifecycleApi<Dependencies> {
  const ctx = getInternals(router);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  const lifecycleNamespace = ctx.routeGetStore().lifecycleNamespace!;

  return {
    addActivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateRouteName(name, "addActivateGuard");
        validateHandler(handler, "addActivateGuard");
      }

      lifecycleNamespace.addCanActivate(name, handler, ctx.noValidate);
    },

    addDeactivateGuard(name, handler) {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateRouteName(name, "addDeactivateGuard");
        validateHandler(handler, "addDeactivateGuard");
      }

      lifecycleNamespace.addCanDeactivate(name, handler, ctx.noValidate);
    },

    removeActivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateRouteName(name, "removeActivateGuard");
      }

      lifecycleNamespace.clearCanActivate(name);
    },

    removeDeactivateGuard(name) {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateRouteName(name, "removeDeactivateGuard");
      }

      lifecycleNamespace.clearCanDeactivate(name);
    },
  };
}
