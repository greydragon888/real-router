import { logger } from "@real-router/logger";
import { validateRouteName } from "type-guards";

import { errorCodes } from "../constants";
import { getInternals } from "../internals";
import {
  clearConfigEntries,
  removeFromDefinitions,
  sanitizeRoute,
} from "../namespaces/RoutesNamespace/helpers";
import {
  clearRouteData,
  refreshForwardMap,
  registerAllRouteHandlers,
} from "../namespaces/RoutesNamespace/routesStore";
import {
  validateAddRouteArgs,
  validateClearRoutes,
  validateParentOption,
  validateRemoveRoute,
  validateRemoveRouteArgs,
  validateUpdateRoute,
  validateUpdateRouteBasicArgs,
  validateUpdateRoutePropertyTypes,
} from "../namespaces/RoutesNamespace/validators";
import { RouterError } from "../RouterError";

import type { RoutesApi } from "./types";
import type { RouterInternals } from "../internals";
import type { RouteLifecycleNamespace } from "../namespaces/RouteLifecycleNamespace";
import type { RoutesStore } from "../namespaces/RoutesNamespace/routesStore";
import type { RouteConfig } from "../namespaces/RoutesNamespace/types";
import type { GuardFnFactory, Route } from "../types";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Params,
  Router,
} from "@real-router/types";
import type { RouteDefinition, RouteTree } from "route-tree";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recursively finds a route definition by its full dotted name.
 */
function findDefinition(
  definitions: RouteDefinition[],
  fullName: string,
  parentPrefix = "",
): RouteDefinition | undefined {
  for (const def of definitions) {
    const currentFullName = parentPrefix
      ? `${parentPrefix}.${def.name}`
      : def.name;

    if (currentFullName === fullName) {
      return def;
    }

    if (def.children && fullName.startsWith(`${currentFullName}.`)) {
      return findDefinition(def.children, fullName, currentFullName);
    }
  }

  /* v8 ignore next -- @preserve: defensive return, callers validate route exists before calling */
  return undefined;
}

/**
 * Clears all config entries and lifecycle handlers for a removed route
 * (and all its descendants).
 */
function clearRouteConfigurations<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routeName: string,
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies>,
): void {
  const shouldClear = (n: string): boolean =>
    n === routeName || n.startsWith(`${routeName}.`);

  clearConfigEntries(config.decoders, shouldClear);
  clearConfigEntries(config.encoders, shouldClear);
  clearConfigEntries(config.defaultParams, shouldClear);
  clearConfigEntries(config.forwardMap, shouldClear);
  clearConfigEntries(config.forwardFnMap, shouldClear);
  clearConfigEntries(routeCustomFields, shouldClear);

  // Clear forwardMap entries pointing TO the deleted route (or its descendants)
  clearConfigEntries(config.forwardMap, (key) =>
    shouldClear(config.forwardMap[key]),
  );

  // Clear lifecycle handlers
  const [canDeactivateFactories, canActivateFactories] =
    lifecycleNamespace.getFactories();

  for (const n of Object.keys(canActivateFactories)) {
    if (shouldClear(n)) {
      lifecycleNamespace.clearCanActivate(n);
    }
  }

  for (const n of Object.keys(canDeactivateFactories)) {
    if (shouldClear(n)) {
      lifecycleNamespace.clearCanDeactivate(n);
    }
  }
}

/**
 * Updates forwardTo for a route in config and returns the refreshed resolved
 * forward map (REPLACE semantics — caller must call ctx.setResolvedForwardMap).
 */
function updateForwardTo<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null,
  config: RouteConfig,
  noValidate: boolean,
  refreshForwardMapFn: (
    config: RouteConfig,
    noValidate: boolean,
  ) => Record<string, string>,
): Record<string, string> {
  if (forwardTo === null) {
    delete config.forwardMap[name];
    delete config.forwardFnMap[name];
  } else if (typeof forwardTo === "string") {
    delete config.forwardFnMap[name];
    config.forwardMap[name] = forwardTo;
  } else {
    delete config.forwardMap[name];
    config.forwardFnMap[name] = forwardTo;
  }

  return refreshForwardMapFn(config, noValidate);
}

/**
 * Builds a full Route object from a bare RouteDefinition by re-attaching
 * config entries and lifecycle factories.
 *
 * RECURSIVE — call with the factories tuple obtained ONCE from
 * `lifecycleNamespace.getFactories()` and pass it through to children.
 */
function enrichRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routeDef: RouteDefinition,
  routeName: string,
  config: RouteConfig,
  factories: [
    Record<string, GuardFnFactory<Dependencies>>,
    Record<string, GuardFnFactory<Dependencies>>,
  ],
): Route<Dependencies> {
  const route: Route<Dependencies> = {
    name: routeDef.name,
    path: routeDef.path,
  };

  const forwardToFn = config.forwardFnMap[routeName];
  const forwardToStr = config.forwardMap[routeName];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (forwardToFn !== undefined) {
    route.forwardTo = forwardToFn;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (forwardToStr !== undefined) {
    route.forwardTo = forwardToStr;
  }

  if (routeName in config.defaultParams) {
    route.defaultParams = config.defaultParams[routeName];
  }

  if (routeName in config.decoders) {
    route.decodeParams = config.decoders[routeName];
  }

  if (routeName in config.encoders) {
    route.encodeParams = config.encoders[routeName];
  }

  const [canDeactivateFactories, canActivateFactories] = factories;

  if (routeName in canActivateFactories) {
    route.canActivate = canActivateFactories[routeName];
  }

  if (routeName in canDeactivateFactories) {
    route.canDeactivate = canDeactivateFactories[routeName];
  }

  if (routeDef.children) {
    route.children = routeDef.children.map((child) =>
      enrichRoute(child, `${routeName}.${child.name}`, config, factories),
    );
  }

  return route;
}

// ============================================================================
// CRUD operations
// ============================================================================

/**
 * Adds one or more routes to the router.
 * Input already validated by facade.
 */
function addRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  noValidate: boolean,
  routes: Route<Dependencies>[],
  parentName?: string,
): void {
  if (parentName) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parentDef = findDefinition(store.definitions, parentName)!;

    parentDef.children ??= [];

    for (const route of routes) {
      parentDef.children.push(sanitizeRoute(route));
    }
  } else {
    for (const route of routes) {
      store.definitions.push(sanitizeRoute(route));
    }
  }

  registerAllRouteHandlers(
    routes,
    store.config,
    store.routeCustomFields,
    store.pendingCanActivate,
    store.pendingCanDeactivate,
    store.depsStore,
    parentName ?? "",
  );

  store.treeOperations.commitTreeChanges(store, noValidate);
}

/**
 * Atomically replaces all routes with a new set.
 * Follows RFC 6-step semantics for HMR support.
 */
function replaceRoutes<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  noValidate: boolean,
  routes: Route<Dependencies>[],
  ctx: RouterInternals<Dependencies>,
  currentPath: string | undefined,
): void {
  // Step 2: Clear route data (WITHOUT tree rebuild)
  clearRouteData(store);

  // Step 3: Clear definition lifecycle handlers (preserve external guards)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed set after wiring
  store.lifecycleNamespace!.clearDefinitionGuards();

  // Step 4: Register new routes
  for (const route of routes) {
    store.definitions.push(sanitizeRoute(route));
  }

  registerAllRouteHandlers(
    routes,
    store.config,
    store.routeCustomFields,
    store.pendingCanActivate,
    store.pendingCanDeactivate,
    store.depsStore,
    "",
  );

  // Step 5: One tree rebuild
  store.treeOperations.commitTreeChanges(store, noValidate);

  // Step 6: Revalidate state
  if (currentPath !== undefined) {
    const revalidated = ctx.matchPath(currentPath, ctx.getOptions());

    if (revalidated) {
      ctx.setState(revalidated);
    } else {
      ctx.clearState();
    }
  }
}

/**
 * Removes a route and all its children.
 *
 * @returns true if removed, false if not found
 */
function removeRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  noValidate: boolean,
  name: string,
): boolean {
  const wasRemoved = removeFromDefinitions(store.definitions, name);

  if (!wasRemoved) {
    return false;
  }

  clearRouteConfigurations(
    name,
    store.config,
    store.routeCustomFields,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    store.lifecycleNamespace!,
  );

  store.treeOperations.commitTreeChanges(store, noValidate);

  return true;
}

/**
 * Updates a route's configuration in place.
 */
function updateRouteConfig<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  noValidate: boolean,
  name: string,
  updates: {
    forwardTo?: string | ForwardToCallback<Dependencies> | null | undefined;
    defaultParams?: Params | null | undefined;
    decodeParams?: ((params: Params) => Params) | null | undefined;
    encodeParams?: ((params: Params) => Params) | null | undefined;
  },
): void {
  if (updates.forwardTo !== undefined) {
    store.resolvedForwardMap = updateForwardTo(
      name,
      updates.forwardTo,
      store.config,
      noValidate,
      refreshForwardMap,
    );
  }

  if (updates.defaultParams !== undefined) {
    if (updates.defaultParams === null) {
      delete store.config.defaultParams[name];
    } else {
      store.config.defaultParams[name] = updates.defaultParams;
    }
  }

  if (updates.decodeParams !== undefined) {
    if (updates.decodeParams === null) {
      delete store.config.decoders[name];
    } else {
      const decoder = updates.decodeParams;

      store.config.decoders[name] = (params: Params): Params =>
        (decoder(params) as Params | undefined) ?? params;
    }
  }

  if (updates.encodeParams !== undefined) {
    if (updates.encodeParams === null) {
      delete store.config.encoders[name];
    } else {
      const encoder = updates.encodeParams;

      store.config.encoders[name] = (params: Params): Params =>
        (encoder(params) as Params | undefined) ?? params;
    }
  }
}

/**
 * Gets a route by name with all its configuration.
 */
function getRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
): Route<Dependencies> | undefined {
  const segments = store.matcher.getSegmentsByName(name);

  if (!segments) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- segments is non-empty (checked above)
  const targetNode = segments.at(-1)! as RouteTree;
  const definition = store.treeOperations.nodeToDefinition(targetNode);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const factories = store.lifecycleNamespace!.getFactories();

  return enrichRoute(definition, name, store.config, factories);
}

/**
 * Gets the custom config fields for a route.
 */
function getRouteConfig<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
): Record<string, unknown> | undefined {
  if (!store.matcher.hasRoute(name)) {
    return undefined;
  }

  return store.routeCustomFields[name];
}

// ============================================================================
// API factory
// ============================================================================

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

        store.treeOperations.validateRoutes(
          routeArray,
          store.tree,
          store.config.forwardMap,
          parentName,
        );
      }

      addRoutes(store, noValidate, routeArray, parentName);
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

      const wasRemoved = removeRoute(store, noValidate, name);

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

      updateRouteConfig(store, noValidate, name, {
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
            true,
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
            true,
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

      store.treeOperations.resetStore(store);
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

      return getRoute(store, name);
    },

    getConfig: (name) => {
      return getRouteConfig(store, name);
    },

    replace: (routes) => {
      throwIfDisposed(ctx.isDisposed);

      const routeArray = Array.isArray(routes) ? routes : [routes];

      const canReplace = validateClearRoutes(ctx.isTransitioning());

      if (!canReplace) {
        return;
      }

      if (!ctx.noValidate) {
        validateAddRouteArgs(routeArray);
        store.treeOperations.validateRoutes(routeArray);
      }

      const currentPath = router.getState()?.path;

      replaceRoutes(store, noValidate, routeArray, ctx, currentPath);
    },
  };
}
