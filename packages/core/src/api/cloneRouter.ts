import { routeTreeToDefinitions } from "route-tree";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { Router as RouterClass } from "../Router";
import { RouterError } from "../RouterError";
import { getLifecycleApi } from "./getLifecycleApi";

import type { Route } from "../types";
import type { DefaultDependencies, Router } from "@real-router/types";

export function cloneRouter<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  dependencies?: Dependencies,
): RouterClass<Dependencies> {
  const ctx = getInternals(router);

  if (ctx.isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }

  ctx.validator?.dependencies.validateCloneArgs(dependencies);

  // Get source store directly
  const sourceStore = ctx.routeGetStore();
  const routes = routeTreeToDefinitions(sourceStore.tree);
  const routeConfig = sourceStore.config;
  const resolvedForwardMap = sourceStore.resolvedForwardMap;
  const routeCustomFields = sourceStore.routeCustomFields;

  const options = ctx.cloneOptions();
  const sourceDeps = ctx.cloneDependencies();
  const [canDeactivateFactories, canActivateFactories] =
    ctx.getLifecycleFactories();
  const pluginFactories = ctx.getPluginFactories();

  const mergedDeps = {
    ...sourceDeps,
    ...dependencies,
  } as Dependencies;

  const newRouter = new RouterClass<Dependencies>(
    routes as Route<Dependencies>[],
    options,
    mergedDeps,
  );

  const lifecycle = getLifecycleApi(newRouter);

  for (const [name, handler] of Object.entries(canDeactivateFactories)) {
    lifecycle.addDeactivateGuard(name, handler);
  }

  for (const [name, handler] of Object.entries(canActivateFactories)) {
    lifecycle.addActivateGuard(name, handler);
  }

  if (pluginFactories.length > 0) {
    newRouter.usePlugin(...pluginFactories);
  }

  const newCtx = getInternals(newRouter);
  const newStore = newCtx.routeGetStore();

  // Apply cloned config directly to new store
  Object.assign(newStore.config.decoders, routeConfig.decoders);
  Object.assign(newStore.config.encoders, routeConfig.encoders);
  Object.assign(newStore.config.defaultParams, routeConfig.defaultParams);
  Object.assign(newStore.config.forwardMap, routeConfig.forwardMap);
  Object.assign(newStore.config.forwardFnMap, routeConfig.forwardFnMap);
  Object.assign(newStore.resolvedForwardMap, resolvedForwardMap);
  Object.assign(newStore.routeCustomFields, routeCustomFields);

  return newRouter;
}
