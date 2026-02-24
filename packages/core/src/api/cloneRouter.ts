import { getTypeDescription } from "type-guards";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import { Router } from "../Router";
import { RouterError } from "../RouterError";

import type { DefaultDependencies } from "@real-router/types";

function validateCloneArgs(dependencies: unknown): void {
  if (dependencies === undefined) {
    return;
  }

  if (
    !(
      dependencies &&
      typeof dependencies === "object" &&
      dependencies.constructor === Object
    )
  ) {
    throw new TypeError(
      `[cloneRouter] Invalid dependencies: expected plain object or undefined, received ${getTypeDescription(dependencies)}`,
    );
  }

  for (const key in dependencies) {
    if (Object.getOwnPropertyDescriptor(dependencies, key)?.get) {
      throw new TypeError(
        `[cloneRouter] Getters not allowed in dependencies: "${key}"`,
      );
    }
  }
}

export function cloneRouter<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  dependencies?: Dependencies,
): Router<Dependencies> {
  const ctx = getInternals(router as unknown as Router);

  if (ctx.isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }

  if (!ctx.noValidate) {
    validateCloneArgs(dependencies);
  }

  const routes = ctx.cloneRoutes();
  const options = ctx.cloneOptions();
  const sourceDeps = ctx.cloneDependencies();
  const [canDeactivateFactories, canActivateFactories] =
    ctx.getLifecycleFactories();
  const pluginFactories = ctx.getPluginFactories();
  const routeConfig = ctx.getRouteConfig();
  const resolvedForwardMap = ctx.getResolvedForwardMap();
  const routeCustomFields = ctx.getRouteCustomFields();

  const mergedDeps = {
    ...sourceDeps,
    ...dependencies,
  } as Dependencies;

  const newRouter = new Router<Dependencies>(
    routes as unknown as ConstructorParameters<typeof Router<Dependencies>>[0],
    options,
    mergedDeps,
  );

  for (const [name, handler] of Object.entries(canDeactivateFactories)) {
    newRouter.addDeactivateGuard(
      name,
      handler as unknown as Parameters<typeof newRouter.addDeactivateGuard>[1],
    );
  }

  for (const [name, handler] of Object.entries(canActivateFactories)) {
    newRouter.addActivateGuard(
      name,
      handler as unknown as Parameters<typeof newRouter.addActivateGuard>[1],
    );
  }

  if (pluginFactories.length > 0) {
    newRouter.usePlugin(
      ...(pluginFactories as unknown as Parameters<typeof newRouter.usePlugin>),
    );
  }

  const newCtx = getInternals(newRouter as unknown as Router);

  newCtx.applyClonedConfig(routeConfig, resolvedForwardMap, routeCustomFields);

  return newRouter;
}
