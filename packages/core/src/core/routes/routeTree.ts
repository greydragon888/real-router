// packages/real-router/modules/core/routes/routeTree.ts

import {
  createRouteTree,
  getSegmentsByName,
  hasSegmentsByName,
  nodeToDefinition,
  validateRoute,
} from "route-tree";
import { validateRouteName } from "type-guards";

import {
  createApplyForwardToUpdate,
  createClearRouteConfigurations,
  createEnrichRoute,
  getRequiredParams,
  registerAllRouteHandlers,
  removeFromDefinitions,
  resolveForwardChain,
  sanitizeRoute,
  updateConfigEntry,
  validateAndCacheForwardMap,
  validateForwardToTargets,
  validateRouteProperties,
} from "./routeConfig";
import { ROUTE_DEFINITIONS_SYMBOL, ROOT_PATH_SYMBOL } from "../../constants";
import {
  getConfig,
  getRouteTree,
  setRouteTree,
  setResolvedForwardMap,
} from "../../internals";

import type { Router, Route, DefaultDependencies } from "core-types";
import type { RouteDefinition, RouteTree } from "route-tree";

// Constants
const DEFAULT_ROUTE_NAME = "";

// =============================================================================
// Validation Helpers (extracted to reduce cognitive complexity)
// =============================================================================

/**
 * Gets the type description for error messages.
 */
function getTypeDescription(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

/**
 * Validates that updates is a plain object.
 *
 * @throws {TypeError} If updates is not a plain object
 */
function validateUpdatesObject(updates: unknown): void {
  if (
    updates === null ||
    typeof updates !== "object" ||
    Array.isArray(updates)
  ) {
    throw new TypeError(
      `[real-router] updateRoute: updates must be an object, got ${getTypeDescription(updates)}`,
    );
  }
}

/**
 * Validates that defaultParams is an object or null.
 *
 * @throws {TypeError} If defaultParams is not an object or null
 */
function validateDefaultParams(defaultParams: unknown): void {
  if (
    defaultParams !== undefined &&
    defaultParams !== null &&
    (typeof defaultParams !== "object" || Array.isArray(defaultParams))
  ) {
    throw new TypeError(
      `[real-router] updateRoute: defaultParams must be an object or null, got ${getTypeDescription(defaultParams)}`,
    );
  }
}

/**
 * Validates a params transformer function (decodeParams/encodeParams).
 *
 * @throws {TypeError} If value is not a function, null, or is async
 */
function validateParamsTransformer(
  value: unknown,
  fieldName: "decodeParams" | "encodeParams",
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "function") {
    throw new TypeError(
      `[real-router] updateRoute: ${fieldName} must be a function or null, got ${typeof value}`,
    );
  }

  // Async functions break matchPath/buildPath (they return Promise instead of Params)
  if (value.constructor.name === "AsyncFunction") {
    throw new TypeError(
      `[real-router] updateRoute: ${fieldName} cannot be an async function`,
    );
  }
}

/**
 * Adds route tree management capabilities to a router instance.
 * Handles route tree construction, addition, and removal.
 *
 * @param routes - Initial routes array
 * @returns Function to enhance router with route tree capabilities
 */
export function withRouteTree<Dependencies extends DefaultDependencies>(
  routes: Route<Dependencies>[],
): (router: Router<Dependencies>) => Router<Dependencies> {
  return (router: Router<Dependencies>): Router<Dependencies> => {
    /**
     * Clears all configurations associated with a route and its children.
     * Created from factory with router bound.
     */
    const clearRouteConfigurations = createClearRouteConfigurations(router);

    /**
     * Validates and applies forwardTo update for a route.
     * Created from factory with forwardMap bound.
     */
    const applyForwardToUpdate = createApplyForwardToUpdate(
      getConfig(router).forwardMap,
    );

    /**
     * @deprecated Will be removed in next version.
     * Use `forwardTo` property in route configuration instead.
     *
     * @param fromRoute - Source route name
     * @param toRoute - Target route name
     * @returns Router instance for chaining
     * @throws {Error} If target route requires parameters not available in source route
     */
    router.forward = (fromRoute, toRoute) => {
      console.warn(
        `[router.forward] Method is deprecated. Use \`forwardTo\` property in route configuration instead.`,
      );

      // Get route tree for validation
      const tree = getRouteTree(router);

      // Validate source route exists
      const fromSegments = getSegmentsByName(tree, fromRoute);

      if (!fromSegments) {
        throw new Error(
          `[real-router] forward: source route "${fromRoute}" does not exist`,
        );
      }

      // Validate target route exists
      const toSegments = getSegmentsByName(tree, toRoute);

      if (!toSegments) {
        throw new Error(
          `[real-router] forward: target route "${toRoute}" does not exist`,
        );
      }

      // Validate target route doesn't require params not in source
      const fromParams = getRequiredParams(fromSegments);
      const toParams = getRequiredParams(toSegments);
      const missingParams: string[] = [];

      for (const param of toParams) {
        if (!fromParams.has(param)) {
          missingParams.push(param);
        }
      }

      if (missingParams.length > 0) {
        throw new Error(
          `[real-router] forward: target route "${toRoute}" requires params ` +
            `[${missingParams.join(", ")}] that are not available in source route "${fromRoute}"`,
        );
      }

      getConfig(router).forwardMap[fromRoute] = toRoute;

      // Revalidate and cache after manual forward addition
      validateAndCacheForwardMap(router);

      return router;
    };

    // Internal state: route definitions and root path
    type RouterInternal = Record<symbol, RouteDefinition[] | string>;
    const routerInternal = router as RouterInternal;

    // Initialize route definitions and tree
    // Sanitize routes to store only essential properties (name, path, children)
    const routeDefinitions: RouteDefinition[] = routes.map((route) =>
      sanitizeRoute(route),
    );

    // Initialize root path (can be changed later via setRootPath)
    routerInternal[ROOT_PATH_SYMBOL] = "";

    setRouteTree(
      router,
      createRouteTree(
        DEFAULT_ROUTE_NAME,
        routerInternal[ROOT_PATH_SYMBOL],
        routeDefinitions,
      ),
    );

    // Initialize resolved forward map cache
    // TODO(RFC-8): Replace with CacheManager.getInstance().setResolvedForwardMap(router, {})
    setResolvedForwardMap(router, {});

    // Store definitions for dynamic addition
    routerInternal[ROUTE_DEFINITIONS_SYMBOL] = routeDefinitions;

    // Register handlers for all routes
    registerAllRouteHandlers(routes, router);

    // Validate and cache forwardTo chains
    validateAndCacheForwardMap(router);

    /**
     * Rebuilds the route tree from given definitions.
     *
     * @param definitions - Route definitions to build from
     * @param skipValidation - Skip validation if routes are pre-validated
     */
    function rebuildTree(
      definitions: readonly RouteDefinition[],
      skipValidation = false,
    ): void {
      const rootPath = routerInternal[ROOT_PATH_SYMBOL] as string;

      setRouteTree(
        router,
        createRouteTree(DEFAULT_ROUTE_NAME, rootPath, definitions, {
          skipValidation,
        }),
      );
    }

    /**
     * Gets the current route tree.
     */
    function getTree(): RouteTree {
      return getRouteTree(router);
    }

    /**
     * Validates a batch of routes before adding them.
     * Checks structure, duplicates, and forwardTo targets.
     */
    function validateRouteBatch(routesToAdd: Route<Dependencies>[]): void {
      const seenNames = new Set<string>();
      const seenPathsByParent = new Map<string, Set<string>>();

      for (const route of routesToAdd) {
        validateRoute(
          route,
          "addRoute",
          getTree(),
          "",
          seenNames,
          seenPathsByParent,
        );
        validateRouteProperties(route, route.name);
      }

      validateForwardToTargets(
        routesToAdd,
        getConfig(router).forwardMap,
        getTree(),
      );
    }

    /**
     * Adds one or more routes to the router tree.
     * Routes are sorted immediately after addition.
     *
     * @param addedRoutes - Route or array of routes to add
     * @returns Router instance for chaining
     * @throws {TypeError} If route structure is invalid
     * @throws {Error} If route already exists or duplicate in batch
     *
     * @example
     * // Single route
     * router.addRoute({ name: 'users', path: '/users' });
     *
     * @example
     * // Multiple routes - prefer batch over loop
     * router.addRoute([
     *   { name: 'users', path: '/users' },
     *   { name: 'users.view', path: '/:id' }
     * ]);
     */
    router.addRoute = (addedRoutes) => {
      const routesToAdd = Array.isArray(addedRoutes)
        ? [...addedRoutes]
        : [addedRoutes];

      // Phase 1: Pre-validation (all routes validated BEFORE any modification)
      validateRouteBatch(routesToAdd);

      // Phase 2: Add to definitions and register handlers
      for (const route of routesToAdd) {
        routeDefinitions.push(sanitizeRoute(route));
      }

      registerAllRouteHandlers(routesToAdd, router);

      // Phase 3: Rebuild tree
      rebuildTree(routeDefinitions, true);

      // Phase 4: Validate and cache forwardTo chains
      validateAndCacheForwardMap(router);

      return router;
    };

    /**
     * Removes a route and all its children from the router.
     * Clears all associated configurations, handlers and rebuilds the tree.
     *
     * @param name - Route name to remove (supports dot notation for nested routes)
     * @returns Router instance for chaining
     * @throws {TypeError} If name is not a valid route name
     *
     * @example
     * // Remove top-level route
     * router.removeRoute('users');
     *
     * @example
     * // Remove nested route (parent remains)
     * router.removeRoute('users.edit');
     */
    router.removeRoute = (name: string): Router<Dependencies> => {
      validateRouteName(name, "removeRoute");

      // Check if trying to remove currently active route (or its parent)
      const currentState = router.getState();

      if (currentState) {
        const currentName = currentState.name;
        const isExactMatch = currentName === name;
        const isParentOfCurrent = currentName.startsWith(`${name}.`);

        if (isExactMatch || isParentOfCurrent) {
          const suffix = isExactMatch ? "" : ` (current: "${currentName}")`;

          console.warn(
            `[router.removeRoute] Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
          );

          return router;
        }
      }

      // Edge case: Warn if navigation is in progress
      // We warn but don't block because we can't determine if this specific route
      // is the navigation target. After FSM migration (RFC-2), this will be improved
      // with RouterState.TRANSITIONING that tracks the target route.
      if (router.isNavigating()) {
        console.warn(
          `[router.removeRoute] Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
        );
      }

      // Try to remove from definitions
      const wasRemoved = removeFromDefinitions(routeDefinitions, name);

      if (!wasRemoved) {
        console.warn(
          `[router.removeRoute] Route "${name}" not found. No changes made.`,
        );

        return router;
      }

      // Clear configurations for removed route
      clearRouteConfigurations(name);

      // Rebuild tree with updated definitions
      rebuildTree(routeDefinitions, true);

      // Revalidate and cache forwardTo chains after removal
      validateAndCacheForwardMap(router);

      return router;
    };

    /**
     * Clears all routes from the router.
     * Removes all route definitions, configurations, and lifecycle handlers.
     * Preserves: listeners, plugins, dependencies, options, state.
     *
     * @returns Router instance for chaining
     *
     * @example
     * // Clear all routes and add new ones
     * router.clearRoutes().addRoute([
     *   { name: 'home', path: '/' },
     *   { name: 'about', path: '/about' }
     * ]);
     */
    router.clearRoutes = (): Router<Dependencies> => {
      if (router.isNavigating()) {
        console.error(
          `[router.clearRoutes] Cannot clear routes while navigation is in progress. Wait for navigation to complete.`,
        );

        return router;
      }

      // Clear all route definitions
      routeDefinitions.length = 0;

      const config = getConfig(router);

      // Clear all config entries (for...in avoids O(K) array allocation)
      for (const key in config.decoders) {
        delete config.decoders[key];
      }

      for (const key in config.encoders) {
        delete config.encoders[key];
      }

      for (const key in config.defaultParams) {
        delete config.defaultParams[key];
      }

      for (const key in config.forwardMap) {
        delete config.forwardMap[key];
      }

      // Clear all lifecycle handlers
      const [canDeactivateFactories, canActivateFactories] =
        router.getLifecycleFactories();

      for (const name in canActivateFactories) {
        router.clearCanActivate(name, true);
      }

      for (const name in canDeactivateFactories) {
        router.clearCanDeactivate(name, true);
      }

      // Clear router state since all routes are removed
      router.setState(undefined);

      // Rebuild empty tree
      rebuildTree(routeDefinitions, true);

      // Clear forward cache
      validateAndCacheForwardMap(router);

      return router;
    };

    /**
     * Retrieves a route by name with all its configuration.
     * Returns the full Route object reconstructed from internal storage.
     *
     * @param name - Route name (supports dot notation for nested routes)
     * @returns Route object with all properties, or undefined if not found
     * @throws {TypeError} If name is not a valid route name
     *
     * @example
     * // Get a top-level route
     * const usersRoute = router.getRoute('users');
     *
     * @example
     * // Get a nested route
     * const profileRoute = router.getRoute('users.profile');
     */
    router.getRoute = (name: string): Route<Dependencies> | undefined => {
      validateRouteName(name, "getRoute");

      const tree = getTree();
      const segments = getSegmentsByName(tree, name);

      if (!segments) {
        return undefined;
      }

      // Get the last segment (the target route)
      // segments is guaranteed to have at least one element here
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const targetNode = segments.at(-1)!;
      const definition = nodeToDefinition(targetNode);

      // Get lifecycle factories for enrichment
      const [, canActivateFactories] = router.getLifecycleFactories();

      // Create enrichRoute function with bound config and factories
      const enrichRoute = createEnrichRoute(
        getConfig(router),
        canActivateFactories,
      );

      return enrichRoute(definition, name);
    };

    /**
     * Checks if a route exists in the router.
     *
     * @param name - Route name (supports dot notation for nested routes)
     * @returns true if route exists, false otherwise
     * @throws {TypeError} If name is not a valid route name
     */
    router.hasRoute = (name: string): boolean => {
      validateRouteName(name, "hasRoute");

      const tree = getTree();

      return hasSegmentsByName(tree, name);
    };

    /**
     * Updates a route's configuration without rebuilding the route tree.
     * Only updates specified properties; unspecified properties remain unchanged.
     * Use `null` to remove a property.
     *
     * @param name - Route name (supports dot notation for nested routes)
     * @param updates - Configuration updates to apply
     * @returns Router instance for chaining
     * @throws {TypeError} If name is not a valid route name
     * @throws {ReferenceError} If route does not exist
     * @throws {Error} If forwardTo target doesn't exist or creates cycle
     *
     * @example
     * // Add forwardTo
     * router.updateRoute('old', { forwardTo: 'new' });
     *
     * @example
     * // Remove forwardTo
     * router.updateRoute('old', { forwardTo: null });
     *
     * @example
     * // Update multiple properties
     * router.updateRoute('users', {
     *   defaultParams: { page: 1 },
     *   canActivate: authGuardFactory
     * });
     */
    router.updateRoute = (name, updates) => {
      validateRouteName(name, "updateRoute");

      // Validate updates is a plain object (JS runtime guard)
      validateUpdatesObject(updates);

      const tree = getTree();
      const segments = getSegmentsByName(tree, name);

      if (!segments) {
        throw new ReferenceError(
          `[real-router] updateRoute: route "${name}" does not exist`,
        );
      }

      // Warn if modifying config during navigation
      // Changes apply immediately but may cause inconsistent behavior
      if (router.isNavigating()) {
        console.error(
          `[router.updateRoute] Route "${name}" config modified while navigation is in progress. ` +
            `Changes will apply immediately and may affect the current transition.`,
        );
      }

      const config = getConfig(router);

      // Cache all property values upfront to protect against mutating getters
      // This ensures consistent behavior regardless of getter side effects
      const {
        forwardTo,
        defaultParams,
        decodeParams,
        encodeParams,
        canActivate,
      } = updates;

      // ============================================================
      // PHASE 1: VALIDATION (all validations before any mutations)
      // This ensures atomicity - either all updates apply or none do
      // ============================================================

      // Validate forwardTo (check target exists and no cycles)
      if (forwardTo !== undefined && forwardTo !== null) {
        // Check for indirect cycles BEFORE mutation
        // This prevents forwardMap corruption when cycle is detected
        const testMap = {
          ...config.forwardMap,
          [name]: forwardTo,
        };

        resolveForwardChain(name, testMap);
      }

      // Validate property types
      validateDefaultParams(defaultParams);
      validateParamsTransformer(decodeParams, "decodeParams");
      validateParamsTransformer(encodeParams, "encodeParams");

      // ============================================================
      // PHASE 2: MUTATION (all mutations after validations pass)
      // ============================================================

      // Apply forwardTo
      if (forwardTo !== undefined) {
        if (forwardTo === null) {
          delete config.forwardMap[name];
        } else {
          applyForwardToUpdate(name, forwardTo, segments, tree);
        }

        validateAndCacheForwardMap(router);
      }

      // Apply config entries
      updateConfigEntry(config.defaultParams, name, defaultParams);
      updateConfigEntry(config.decoders, name, decodeParams);
      updateConfigEntry(config.encoders, name, encodeParams);

      // Handle canActivate (uses different API)
      if (canActivate !== undefined) {
        if (canActivate === null) {
          router.clearCanActivate(name, true);
        } else {
          router.canActivate(name, canActivate);
        }
      }

      return router;
    };

    return router;
  };
}
