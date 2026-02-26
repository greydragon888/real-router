// packages/core/src/namespaces/RoutesNamespace/routesCrud.ts

import { logger } from "@real-router/logger";
import { nodeToDefinition } from "route-tree";

import {
  clearConfigEntries,
  createEmptyConfig,
  removeFromDefinitions,
  resolveForwardChain,
  sanitizeRoute,
} from "./helpers";
import {
  commitTreeChanges,
  rebuildTreeInPlace,
  refreshForwardMap,
  registerAllRouteHandlers,
} from "./routeTreeOps";

import type { RoutesStore } from "./routesStore";
import type { RouteConfig } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Params,
} from "@real-router/types";
import type { Matcher, RouteDefinition, RouteTree } from "route-tree";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recursively finds a route definition by its full dotted name.
 */
export function findDefinition(
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
 * Collects URL params from segments into a Set.
 */
export function collectUrlParams(segments: readonly RouteTree[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.add(param);
    }
  }

  return params;
}

/**
 * Clears all config entries and lifecycle handlers for a removed route
 * (and all its descendants).
 */
export function clearRouteConfigurations<
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
export function updateForwardTo<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null,
  config: RouteConfig,
  noValidate: boolean,
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

  return refreshForwardMap(config, noValidate);
}

/**
 * Builds a full Route object from a bare RouteDefinition by re-attaching
 * config entries and lifecycle factories.
 *
 * RECURSIVE — call with the factories tuple obtained ONCE from
 * `lifecycleNamespace.getFactories()` and pass it through to children.
 */
export function enrichRoute<
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
 * Clears all routes and resets config (standalone CRUD function).
 * Does NOT clear lifecycle handlers or state — caller handles that.
 *
 * @param store - Routes store
 */
export function clearRoutesCrud<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  store.definitions.length = 0;

  Object.assign(store.config, createEmptyConfig());

  store.resolvedForwardMap = Object.create(null) as Record<string, string>;
  store.routeCustomFields = Object.create(null) as Record<
    string,
    Record<string, unknown>
  >;

  rebuildTreeInPlace(store);
}

/**
 * Adds one or more routes to the router (standalone CRUD function).
 * Input already validated by facade.
 *
 * @param store - Routes store
 * @param noValidate - Skip forward map validation
 * @param routes - Routes to add
 * @param parentName - Optional parent route fullName for nesting
 */
export function addRoutesCrud<
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

  commitTreeChanges(store, noValidate);
}

/**
 * Removes a route and all its children (standalone CRUD function).
 *
 * @param store - Routes store
 * @param noValidate - Skip forward map validation
 * @param name - Route name (already validated)
 * @returns true if removed, false if not found
 */
export function removeRouteCrud<
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

  commitTreeChanges(store, noValidate);

  return true;
}

/**
 * Updates a route's configuration in place (standalone CRUD function).
 *
 * @param store - Routes store
 * @param noValidate - Skip forward map validation
 * @param name - Route name
 * @param updates - Config updates to apply
 * @param updates.forwardTo - New forwardTo target (null removes it)
 * @param updates.defaultParams - New default params (null removes them)
 * @param updates.decodeParams - New decoder (null removes it)
 * @param updates.encodeParams - New encoder (null removes it)
 */
export function updateRouteConfigCrud<
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
 * Gets a route by name with all its configuration (standalone CRUD function).
 *
 * @param store - Routes store
 * @param name - Route name
 */
export function getRouteCrud<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  store: RoutesStore<Dependencies>,
  name: string,
): Route<Dependencies> | undefined {
  const segments = store.matcher.getSegmentsByName(name);

  if (!segments) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const targetNode = segments.at(-1)! as RouteTree;
  const definition = nodeToDefinition(targetNode);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const factories = store.lifecycleNamespace!.getFactories();

  return enrichRoute(definition, name, store.config, factories);
}

/**
 * Gets the custom config fields for a route (standalone CRUD function).
 *
 * @param store - Routes store
 * @param name - Route name
 */
export function getRouteConfigCrud<
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
// Validators
// ============================================================================

/**
 * Validates removeRoute constraints.
 * Returns false if removal should be blocked (route is active).
 * Logs warnings for edge cases.
 *
 * @param name - Route name to remove
 * @param currentStateName - Current active route name (or undefined)
 * @param isNavigating - Whether navigation is in progress
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  isNavigating: boolean,
): boolean {
  // Check if trying to remove currently active route (or its parent)
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    const isParentOfCurrent = currentStateName.startsWith(`${name}.`);

    if (isExactMatch || isParentOfCurrent) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  // Warn if navigation is in progress (but allow removal)
  if (isNavigating) {
    logger.warn(
      "router.removeRoute",
      `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
    );
  }

  return true;
}

/**
 * Validates clearRoutes operation.
 * Returns false if operation should be blocked (navigation in progress).
 *
 * @param isNavigating - Whether navigation is in progress
 * @returns true if clearRoutes can proceed, false if blocked
 */
export function validateClearRoutes(isNavigating: boolean): boolean {
  if (isNavigating) {
    logger.error(
      "router.clearRoutes",
      "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
    );

    return false;
  }

  return true;
}

/**
 * Validates that forwardTo target doesn't require params that source doesn't have.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param matcher - Current route matcher
 */
export function validateForwardToParamCompatibility(
  sourceName: string,
  targetName: string,
  matcher: Matcher,
): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sourceSegments = matcher.getSegmentsByName(
    sourceName,
  )! as readonly RouteTree[];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const targetSegments = matcher.getSegmentsByName(
    targetName,
  )! as readonly RouteTree[];

  // Get source URL params as a Set for O(1) lookup
  const sourceParams = collectUrlParams(sourceSegments);

  // Build target URL params array (inline — no separate helper needed)
  const targetParams: string[] = [];

  for (const segment of targetSegments) {
    for (const param of segment.paramMeta.urlParams) {
      targetParams.push(param);
    }
  }

  // Check if target requires params that source doesn't have
  const missingParams = targetParams.filter(
    (param) => !sourceParams.has(param),
  );

  if (missingParams.length > 0) {
    throw new Error(
      `[real-router] forwardTo target "${targetName}" requires params ` +
        `[${missingParams.join(", ")}] that are not available in source route "${sourceName}"`,
    );
  }
}

/**
 * Validates that adding forwardTo doesn't create a cycle.
 * Creates a test map with the new entry and uses resolveForwardChain
 * to detect cycles before any mutation happens.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param config - Current route config (forwardMap read-only in this call)
 */
export function validateForwardToCycle(
  sourceName: string,
  targetName: string,
  config: RouteConfig,
): void {
  // Create a test map with the new entry to validate BEFORE mutation
  const testMap = {
    ...config.forwardMap,
    [sourceName]: targetName,
  };

  // resolveForwardChain will throw if cycle is detected or max depth exceeded
  resolveForwardChain(sourceName, testMap);
}

/**
 * Validates updateRoute instance-level constraints (route existence, forwardTo).
 *
 * @param name - Route name (already validated by static method)
 * @param forwardTo - Cached forwardTo value
 * @param hasRoute - Function to check route existence
 * @param matcher - Current route matcher
 * @param config - Current route config
 */
export function validateUpdateRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null | undefined,
  hasRoute: (n: string) => boolean,
  matcher: Matcher,
  config: RouteConfig,
): void {
  // Validate route exists
  if (!hasRoute(name)) {
    throw new ReferenceError(
      `[real-router] updateRoute: route "${name}" does not exist`,
    );
  }

  // Validate forwardTo target exists and is valid (only for string forwardTo)
  if (
    forwardTo !== undefined &&
    forwardTo !== null &&
    typeof forwardTo === "string"
  ) {
    if (!hasRoute(forwardTo)) {
      throw new Error(
        `[real-router] updateRoute: forwardTo target "${forwardTo}" does not exist`,
      );
    }

    // Check forwardTo param compatibility
    validateForwardToParamCompatibility(name, forwardTo, matcher);

    // Check for cycle detection
    validateForwardToCycle(name, forwardTo, config);
  }
}
