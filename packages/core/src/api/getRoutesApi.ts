import { logger } from "@real-router/logger";
import { validateRouteName } from "type-guards";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import {
  addRoutesCrud,
  clearRoutesCrud,
  getRouteConfigCrud,
  getRouteCrud,
  removeRouteCrud,
  updateRouteConfigCrud,
  validateClearRoutes,
  validateRemoveRoute,
  validateUpdateRoute,
} from "../namespaces/RoutesNamespace/routesCrud";
import {
  validateAddRouteArgs,
  validateParentOption,
  validateRemoveRouteArgs,
  validateRoutes,
  validateUpdateRouteBasicArgs,
  validateUpdateRoutePropertyTypes,
} from "../namespaces/RoutesNamespace/validators";
import { RouterError } from "../RouterError";

import type { Router } from "../Router";
import type { RoutesApi } from "./types";
import type { DefaultDependencies } from "@real-router/types";

function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

export function getRoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): RoutesApi<Dependencies> {
  const ctx = getInternals(router);

  const store = ctx.routeGetStore();
  const noValidate = ctx.noValidate;

  return {
    add: (routes, options) => {
      throwIfDisposed(ctx.isDisposed);

      const routeArray = Array.isArray(routes) ? routes : [routes];
      const parentName = options?.parent;

      if (!ctx.noValidate) {
        if (parentName !== undefined) {
          validateParentOption(parentName);
        }

        validateAddRouteArgs(routeArray);

        validateRoutes(
          routeArray,
          store.tree,
          store.config.forwardMap,
          parentName,
        );
      }

      addRoutesCrud(store, noValidate, routeArray, parentName);
    },

    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateRemoveRouteArgs(name);
      }

      const canRemove = validateRemoveRoute(
        name,
        ctx.getStateName(),
        ctx.isTransitioning(),
      );

      if (!canRemove) {
        return;
      }

      const wasRemoved = removeRouteCrud(store, noValidate, name);

      if (!wasRemoved) {
        logger.warn(
          "router.removeRoute",
          `Route "${name}" not found. No changes made.`,
        );
      }
    },

    update: (name, updates) => {
      throwIfDisposed(ctx.isDisposed);

      if (!ctx.noValidate) {
        validateUpdateRouteBasicArgs(name, updates);
      }

      const {
        forwardTo,
        defaultParams,
        decodeParams,
        encodeParams,
        canActivate,
        canDeactivate,
      } = updates;

      if (!ctx.noValidate) {
        validateUpdateRoutePropertyTypes(
          forwardTo,
          defaultParams,
          decodeParams,
          encodeParams,
        );
      }

      /* v8 ignore next 6 -- @preserve: race condition guard, mirrors Router.updateRoute() same-path guard tested via Router.ts unit tests */
      if (ctx.isTransitioning()) {
        logger.error(
          "router.updateRoute",
          `Updating route "${name}" while navigation is in progress. This may cause unexpected behavior.`,
        );
      }

      if (!ctx.noValidate) {
        validateUpdateRoute(
          name,
          forwardTo,
          (n) => store.matcher.hasRoute(n),
          store.matcher,
          store.config,
        );
      }

      updateRouteConfigCrud(store, noValidate, name, {
        forwardTo,
        defaultParams,
        decodeParams,
        encodeParams,
      });

      if (canActivate !== undefined) {
        if (canActivate === null) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.clearCanActivate(name);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.addCanActivate(
            name,
            canActivate,
            noValidate,
          );
        }
      }

      if (canDeactivate !== undefined) {
        if (canDeactivate === null) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.clearCanDeactivate(name);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
          store.lifecycleNamespace!.addCanDeactivate(
            name,
            canDeactivate,
            noValidate,
          );
        }
      }
    },

    clear: () => {
      throwIfDisposed(ctx.isDisposed);

      const canClear = validateClearRoutes(ctx.isTransitioning());

      /* v8 ignore next 3 -- @preserve: race condition guard, mirrors Router.clearRoutes() same-path guard tested via validateClearRoutes unit tests */
      if (!canClear) {
        return;
      }

      clearRoutesCrud(store);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
      store.lifecycleNamespace!.clearAll();
      ctx.clearState();
    },

    has: (name) => {
      if (!ctx.noValidate) {
        validateRouteName(name, "hasRoute");
      }

      return store.matcher.hasRoute(name);
    },

    get: (name) => {
      if (!ctx.noValidate) {
        validateRouteName(name, "getRoute");
      }

      return getRouteCrud(store, name);
    },

    getConfig: (name) => {
      return getRouteConfigCrud(store, name);
    },
  };
}
