import { logger } from "@real-router/logger";
import { validateRouteName } from "type-guards";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import {
  addRoutesCrud,
  getRouteConfigCrud,
  getRouteCrud,
  removeRouteCrud,
  updateRouteConfigCrud,
  validateClearRoutes,
  validateRemoveRoute,
  validateUpdateRoute,
  type RoutesDataContext,
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

import type { RouteLifecycleNamespace } from "../namespaces/RouteLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace/types";
import type { Router } from "../Router";
import type { GuardFnFactory, Route } from "../types";
import type { RoutesApi } from "./types";
import type {
  DefaultDependencies,
  ForwardToCallback,
} from "@real-router/types";

function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

export function getRoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): RoutesApi<Dependencies> {
  const ctx = getInternals(router as unknown as Router);

  const dataCtx: RoutesDataContext<Dependencies> = {
    definitions: ctx.routeDefinitions,
    config: ctx.routeConfig,
    noValidate: ctx.noValidate,
    matcherOptions: ctx.routeMatcherOptions,
    getCustomFields: ctx.getRouteCustomFields,
    setCustomFields: ctx.routeSetCustomFields,
    getMatcher: ctx.routeGetMatcher,
    getRootPath: ctx.getRootPath,
    setTreeAndMatcher: (tree, matcher) => {
      ctx.routeSetTreeAndMatcher(tree, matcher);
    },
    setResolvedForwardMap: ctx.routeReplaceResolvedForwardMap,
    getResolvedForwardMap: ctx.getResolvedForwardMap,
    getDepsStore: ctx.routeGetDepsStore as () =>
      | RoutesDependencies<Dependencies>
      | undefined,
    getPendingCanActivate: ctx.routeGetPendingCanActivate as () => Map<
      string,
      GuardFnFactory<Dependencies>
    >,
    getPendingCanDeactivate: ctx.routeGetPendingCanDeactivate as () => Map<
      string,
      GuardFnFactory<Dependencies>
    >,
    getLifecycleNamespace:
      ctx.routeGetLifecycleNamespace as () => RouteLifecycleNamespace<Dependencies>,
  };

  return {
    add: (routes, options) => {
      throwIfDisposed(ctx.isDisposed);

      const routeArray = Array.isArray(routes) ? routes : [routes];
      const parentName = options?.parent;

      if (!ctx.noValidate) {
        if (parentName !== undefined) {
          validateParentOption(parentName);
        }

        validateAddRouteArgs(routeArray as unknown as Route[]);

        validateRoutes(
          routeArray,
          ctx.routeGetTree(),
          ctx.routeGetForwardRecord(),
          parentName,
        );
      }

      addRoutesCrud(
        dataCtx,
        routeArray as unknown as Route<Dependencies>[],
        parentName,
      );
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

      const wasRemoved = removeRouteCrud(dataCtx, name);

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
          forwardTo as unknown as
            | string
            | ForwardToCallback<Dependencies>
            | null
            | undefined,
          ctx.routeHasRoute,
          ctx.routeGetMatcher(),
          ctx.routeConfig,
        );
      }

      updateRouteConfigCrud(dataCtx, name, {
        forwardTo: forwardTo as unknown as
          | string
          | ForwardToCallback<Dependencies>
          | null
          | undefined,
        defaultParams: defaultParams,
        decodeParams,
        encodeParams,
      });

      if (canActivate !== undefined) {
        if (canActivate === null) {
          ctx.lifecycleClearCanActivate(name);
        } else {
          ctx.lifecycleAddCanActivate(
            name,
            canActivate as unknown as boolean | GuardFnFactory,
            ctx.noValidate,
          );
        }
      }

      if (canDeactivate !== undefined) {
        if (canDeactivate === null) {
          ctx.lifecycleClearCanDeactivate(name);
        } else {
          ctx.lifecycleAddCanDeactivate(
            name,
            canDeactivate as unknown as boolean | GuardFnFactory,
            ctx.noValidate,
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

      ctx.routeClearRoutes();
      ctx.lifecycleClearAll();
      ctx.clearState();
    },

    has: (name) => {
      if (!ctx.noValidate) {
        validateRouteName(name, "hasRoute");
      }

      return ctx.routeHasRoute(name);
    },

    get: (name) => {
      if (!ctx.noValidate) {
        validateRouteName(name, "getRoute");
      }

      return getRouteCrud(dataCtx, name);
    },

    getConfig: (name) => {
      return getRouteConfigCrud(dataCtx as unknown as RoutesDataContext, name);
    },
  };
}
