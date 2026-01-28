// packages/real-router/modules/core/routes/routeQuery.ts

import { logger } from "@real-router/logger";
import { routeTreeToDefinitions } from "route-tree";
import { isString, validateRouteName } from "type-guards";

import { createRouter } from "../../createRouter";

import { validateParams } from "./routeConfig";
import {
  getConfig,
  getResolvedForwardMap,
  getRouteTree,
  setConfig,
  setResolvedForwardMap,
} from "../../internals";
import { getTransitionPath } from "../../transitionPath";

import type {
  Params,
  State,
  Router,
  Route,
  DefaultDependencies,
} from "@real-router/types";

// Constants
const DEFAULT_ROUTE_NAME = "";

// Cache for validated route names to skip regex validation on repeated calls
// Key insight: validateRouteName() regex takes ~40ns, but cache lookup is ~1ns
// This cache is module-level (shared across all router instances) since route name
// validity is independent of router instance
const validatedRouteNames = new Set<string>();

/**
 * Checks if all params from source exist with same values in target.
 * Extracted for cognitive complexity reduction.
 * Small function body allows V8 inlining.
 */
function paramsMatch(source: Params, target: Params): boolean {
  for (const key in source) {
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks params match, skipping keys present in skipKeys.
 */
function paramsMatchExcluding(
  source: Params,
  target: Params,
  skipKeys: Params,
): boolean {
  for (const key in source) {
    if (key in skipKeys) {
      continue;
    }
    if (source[key] !== target[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Adds route query and state inspection capabilities to a router instance.
 * Handles route activity checks, route relationships, node update predicates, and cloning.
 *
 * @returns Function to enhance router with query capabilities
 */
export function withRouteQuery<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
): Router<Dependencies> {
  /**
   * Checks if a route is currently active.
   *
   * Optimized implementation that avoids creating State objects and
   * traversing the route tree when possible.
   *
   * @param name - Route name to check
   * @param params - Route parameters to match
   * @param strictEquality - Whether to require exact match (default: false)
   * @param ignoreQueryParams - Whether to ignore query parameters (default: true)
   * @returns True if route is active, false otherwise
   * @throws {TypeError} If name is not a valid route name or params are invalid
   *
   * @example
   * // Check if specific user view is active
   * router.isActiveRoute('users.view', { id: '123' });
   */
  router.isActiveRoute = (
    name: string,
    params: Params = {},
    strictEquality = false,
    ignoreQueryParams = true,
  ): boolean => {
    // Fast path: skip regex validation for already-validated route names
    // Saves ~40ns per call (regex validation cost)
    if (!validatedRouteNames.has(name)) {
      validateRouteName(name, "isActiveRoute");
      validatedRouteNames.add(name);
    }

    validateParams(params, "isActiveRoute");

    // Validate boolean parameters (prevent truthy/falsy coercion bugs)
    // These checks are for JavaScript users who may pass non-boolean values
    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- JS runtime guards */
    if (strictEquality !== undefined && typeof strictEquality !== "boolean") {
      throw new TypeError(
        `[router.isActiveRoute] strictEquality must be a boolean, got ${typeof strictEquality}`,
      );
    }
    if (
      ignoreQueryParams !== undefined &&
      typeof ignoreQueryParams !== "boolean"
    ) {
      throw new TypeError(
        `[router.isActiveRoute] ignoreQueryParams must be a boolean, got ${typeof ignoreQueryParams}`,
      );
    }
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */

    // Warn about empty string usage (likely a bug)
    // Root node ("") is not considered a parent of any named route
    if (name === "") {
      logger.warn(
        "real-router",
        'isActiveRoute("") called with empty string. ' +
          "The root node is not considered active for any named route. " +
          "To check if router has active state, use: router.getState() !== undefined",
      );

      return false;
    }

    const activeState = router.getState();

    // Early return if no active state
    if (!activeState) {
      return false;
    }

    const activeName = activeState.name;

    // Fast path: check if routes are related before any expensive operations
    // Routes are related if: equal, or one is ancestor of the other
    if (
      activeName !== name &&
      !activeName.startsWith(`${name}.`) &&
      !name.startsWith(`${activeName}.`)
    ) {
      return false;
    }

    // Get defaultParams once (may be undefined at runtime)
    // Cast needed because Record<string, Params> doesn't include undefined for missing keys
    const defaultParams = getConfig(router).defaultParams[name] as
      | Params
      | undefined;

    // Exact match case (strictEquality or same name)
    if (strictEquality || activeName === name) {
      // Optimize: only create merged object if defaultParams exist
      const effectiveParams = defaultParams
        ? { ...defaultParams, ...params }
        : params;

      // Use areStatesEqual for proper param comparison
      // Create minimal state object (without buildPath - the expensive part)
      const targetState: State = {
        name,
        params: effectiveParams,
        path: "", // Not used for comparison
      };

      return router.areStatesEqual(targetState, activeState, ignoreQueryParams);
    }

    // Hierarchical check: activeState is a descendant of target (name)
    // At this point we know: activeName.startsWith(`${name}.`)
    // Check that all target params are present in activeState
    const activeParams = activeState.params;

    if (!paramsMatch(params, activeParams)) {
      return false;
    }

    // Check defaultParams (skip keys already in params)
    return (
      !defaultParams ||
      paramsMatchExcluding(defaultParams, activeParams, params)
    );
  };

  /**
   * Creates a predicate function to check if a route node should be updated.
   * Used internally by the transition system and integrations.
   *
   * @param nodeName - Route node name to check
   * @returns Predicate function for update checking
   * @throws {TypeError} If nodeName is not a string
   */
  router.shouldUpdateNode = (nodeName: string) => {
    // Validate nodeName type (can come from user code via React props)
    if (!isString(nodeName)) {
      throw new TypeError(
        `[router.shouldUpdateNode] nodeName must be a string, got ${typeof nodeName}`,
      );
    }
    // No need to validate node existence. Non-existent nodes correctly return false as they won't be in intersection, toActivate, or toDeactivate arrays

    return (toState: State, fromState?: State): boolean => {
      // Validate toState is state like obj
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!(toState && typeof toState === "object" && "name" in toState)) {
        throw new TypeError(
          "[router.shouldUpdateNode] toState must be valid State object",
        );
      }

      // Force update all nodes when reload option is set
      if (toState.meta?.options.reload) {
        return true;
      }

      // Root node should always update on initial navigation
      if (nodeName === DEFAULT_ROUTE_NAME && !fromState) {
        return true;
      }

      const { intersection, toActivate, toDeactivate } = getTransitionPath(
        toState,
        fromState,
      );

      // Update node at the boundary where paths diverge
      if (nodeName === intersection) {
        return true;
      }

      // Check if node is being activated
      if (toActivate.includes(nodeName)) {
        return true;
      }

      // Check if node is being deactivated
      return toDeactivate.includes(nodeName);
    };
  };

  /**
   * Creates an independent clone of this router with the same configuration.
   *
   * The clone inherits routes, options, middleware, plugins, lifecycle handlers,
   * and config (decoders, encoders, defaultParams, forwardMap), but NOT:
   * - Current state (clone starts unstarted with no active state)
   * - Event listeners/subscribers
   * - Original dependencies (must be passed explicitly)
   *
   * @param dependencies - New dependencies for the cloned router (default: empty object).
   *   Original router's dependencies are NOT copied automatically.
   *   To copy them: `router.clone(router.getDependencies())`
   * @returns A new independent router instance
   *
   * @example
   * ```typescript
   * // SSR: isolated router per request
   * const requestRouter = baseRouter.clone();
   * requestRouter.start(req.url);
   *
   * // Testing: fresh router with mock dependencies
   * const testRouter = router.clone({ api: mockApi });
   *
   * // Chain cloning is supported
   * const clone2 = clone1.clone();
   * ```
   *
   * @remarks
   * **Limitations:**
   *
   * 1. **Symbol-keyed dependencies are not copied.**
   *    The clone uses `for...in` iteration which skips Symbol keys.
   *    ```typescript
   *    const sym = Symbol('secret');
   *    router.clone({ [sym]: value }); // sym will be ignored
   *    ```
   *
   * 2. **Functions in `defaultParams` will throw.**
   *    The `Params` type excludes functions, but if bypassed via `as any`,
   *    `structuredClone` will throw `DataCloneError`.
   *    ```typescript
   *    // TypeScript prevents this (TS2322), but if bypassed:
   *    router.config.defaultParams.x = { fn: () => {} } as any;
   *    router.clone(); // throws DataCloneError
   *    ```
   *
   * 3. **Middleware/plugin factories are shared references.**
   *    State created inside `(router) => { ... }` is isolated per router.
   *    State in outer closures is shared between original and clones.
   */
  router.clone = (dependencies = {} as Dependencies): Router<Dependencies> => {
    const tree = getRouteTree(router);

    // Convert tree back to definitions and build cloned router
    const clonedRouter = createRouter<Dependencies>(
      routeTreeToDefinitions(tree) as Route<Dependencies>[],
      router.getOptions(),
      dependencies,
    );

    // Copy middleware factories
    clonedRouter.useMiddleware(...router.getMiddlewareFactories());

    // Copy plugin factories
    clonedRouter.usePlugin(...router.getPlugins());

    // Copy config with proper depth:
    // - decoders/encoders: shallow (functions can't be cloned)
    // - defaultParams: deep (may contain nested objects)
    // - forwardMap: shallow (primitive string values only)
    const originalConfig = getConfig(router);

    setConfig(clonedRouter, {
      decoders: { ...originalConfig.decoders },
      encoders: { ...originalConfig.encoders },
      defaultParams: structuredClone(originalConfig.defaultParams),
      forwardMap: { ...originalConfig.forwardMap },
    });

    // Copy resolved forward map (stored in Symbol)
    // TODO(RFC-8): Replace with CacheManager copy logic
    setResolvedForwardMap(clonedRouter, { ...getResolvedForwardMap(router) });

    // Copy lifecycle handlers
    const [canDeactivateFactories, canActivateFactories] =
      router.getLifecycleFactories();

    for (const name of Object.keys(canDeactivateFactories)) {
      clonedRouter.canDeactivate(name, canDeactivateFactories[name]);
    }

    for (const name of Object.keys(canActivateFactories)) {
      clonedRouter.canActivate(name, canActivateFactories[name]);
    }

    return clonedRouter;
  };

  return router;
}
