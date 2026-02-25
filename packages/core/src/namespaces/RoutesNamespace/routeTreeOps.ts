// packages/core/src/namespaces/RoutesNamespace/routeTreeOps.ts

import { logger } from "@real-router/logger";
import { createMatcher, createRouteTree } from "route-tree";

import { DEFAULT_ROUTE_NAME } from "./constants";
import { resolveForwardChain } from "./helpers";

import type { RouteConfig, RoutesDependencies } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { DefaultDependencies, Params } from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "route-tree";

/**
 * Context for commitTreeChanges — subset of RoutesDataContext.
 */
interface TreeCommitContext {
  readonly definitions: RouteDefinition[];
  readonly config: RouteConfig;
  readonly noValidate: boolean;
  readonly matcherOptions: CreateMatcherOptions | undefined;
  getRootPath: () => string;
  setTreeAndMatcher: (tree: RouteTree, matcher: Matcher) => void;
  setResolvedForwardMap: (map: Record<string, string>) => void;
}

/**
 * Rebuilds the route tree and matcher from definitions.
 */
export function rebuildTree(
  definitions: RouteDefinition[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): { tree: RouteTree; matcher: Matcher } {
  const tree = createRouteTree(DEFAULT_ROUTE_NAME, rootPath, definitions);
  const matcher = createMatcher(matcherOptions);

  matcher.registerTree(tree);

  return { tree, matcher };
}

/**
 * Rebuilds tree+matcher and refreshes forward map in one atomic step.
 * Replaces the repeated 3-line pattern in CRUD functions.
 */
export function commitTreeChanges(ctx: TreeCommitContext): void {
  const result = rebuildTree(
    ctx.definitions,
    ctx.getRootPath(),
    ctx.matcherOptions,
  );

  ctx.setTreeAndMatcher(result.tree, result.matcher);
  ctx.setResolvedForwardMap(refreshForwardMap(ctx.config, ctx.noValidate));
}

/**
 * Refreshes forward map cache, conditionally validating based on noValidate flag.
 */
export function refreshForwardMap(
  config: RouteConfig,
  noValidate: boolean,
): Record<string, string> {
  if (noValidate) {
    return cacheForwardMap(config);
  }

  return validateAndCacheForwardMap(config);
}

/**
 * Validates and caches forward chains (detects cycles).
 */
export function validateAndCacheForwardMap(
  config: RouteConfig,
): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;

  for (const fromRoute of Object.keys(config.forwardMap)) {
    map[fromRoute] = resolveForwardChain(fromRoute, config.forwardMap);
  }

  return map;
}

/**
 * Caches forward chains without validation (noValidate mode).
 * Simply resolves chains without cycle detection or max depth checks.
 */
export function cacheForwardMap(config: RouteConfig): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;

  for (const fromRoute of Object.keys(config.forwardMap)) {
    let current = fromRoute;

    while (config.forwardMap[current]) {
      current = config.forwardMap[current];
    }

    map[fromRoute] = current;
  }

  return map;
}

/**
 * Registers forwardTo for a route in the config maps.
 * Warns about canActivate/canDeactivate conflicts with forwardTo.
 * Validates that forwardTo is not async.
 */
export function registerForwardTo<Dependencies extends DefaultDependencies>(
  route: Route<Dependencies>,
  fullName: string,
  config: RouteConfig,
): void {
  if (route.canActivate) {
    /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
    const forwardTarget =
      typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

    logger.warn(
      "real-router",
      `Route "${fullName}" has both forwardTo and canActivate. ` +
        `canActivate will be ignored because forwardTo creates a redirect (industry standard). ` +
        `Move canActivate to the target route "${forwardTarget}".`,
    );
  }

  if (route.canDeactivate) {
    /* v8 ignore next -- @preserve: edge case, both string and function tested separately */
    const forwardTarget =
      typeof route.forwardTo === "string" ? route.forwardTo : "[dynamic]";

    logger.warn(
      "real-router",
      `Route "${fullName}" has both forwardTo and canDeactivate. ` +
        `canDeactivate will be ignored because forwardTo creates a redirect (industry standard). ` +
        `Move canDeactivate to the target route "${forwardTarget}".`,
    );
  }

  // Async validation ALWAYS runs (even with noValidate=true)
  if (typeof route.forwardTo === "function") {
    const isNativeAsync =
      (route.forwardTo as { constructor: { name: string } }).constructor
        .name === "AsyncFunction";
    const isTranspiledAsync = route.forwardTo.toString().includes("__awaiter");

    if (isNativeAsync || isTranspiledAsync) {
      throw new TypeError(
        `forwardTo callback cannot be async for route "${fullName}". ` +
          `Async functions break matchPath/buildPath.`,
      );
    }
  }

  // forwardTo is guaranteed to exist at this point
  if (typeof route.forwardTo === "string") {
    config.forwardMap[fullName] = route.forwardTo;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    config.forwardFnMap[fullName] = route.forwardTo!;
  }
}

/**
 * Registers all handlers for a single route (custom fields, canActivate,
 * canDeactivate, forwardTo, decoders, encoders, defaultParams).
 */
export function registerSingleRouteHandlers<
  Dependencies extends DefaultDependencies,
>(
  route: Route<Dependencies>,
  fullName: string,
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
  pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
  depsStore: RoutesDependencies<Dependencies> | undefined,
): void {
  const standardKeys = new Set([
    "name",
    "path",
    "children",
    "canActivate",
    "canDeactivate",
    "forwardTo",
    "encodeParams",
    "decodeParams",
    "defaultParams",
  ]);
  const customFields = Object.fromEntries(
    Object.entries(route).filter(([k]) => !standardKeys.has(k)),
  );

  if (Object.keys(customFields).length > 0) {
    routeCustomFields[fullName] = customFields;
  }

  if (route.canActivate) {
    if (depsStore) {
      depsStore.addActivateGuard(fullName, route.canActivate);
    } else {
      pendingCanActivate.set(fullName, route.canActivate);
    }
  }

  if (route.canDeactivate) {
    if (depsStore) {
      depsStore.addDeactivateGuard(fullName, route.canDeactivate);
    } else {
      pendingCanDeactivate.set(fullName, route.canDeactivate);
    }
  }

  if (route.forwardTo) {
    registerForwardTo(route, fullName, config);
  }

  if (route.decodeParams) {
    config.decoders[fullName] = (params: Params): Params =>
      route.decodeParams?.(params) ?? params;
  }

  if (route.encodeParams) {
    config.encoders[fullName] = (params: Params): Params =>
      route.encodeParams?.(params) ?? params;
  }

  if (route.defaultParams) {
    config.defaultParams[fullName] = route.defaultParams;
  }
}

/**
 * Registers handlers for all routes and their children recursively.
 */
export function registerAllRouteHandlers<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  config: RouteConfig,
  routeCustomFields: Record<string, Record<string, unknown>>,
  pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
  pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
  depsStore: RoutesDependencies<Dependencies> | undefined,
  parentName = "",
): void {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    registerSingleRouteHandlers(
      route,
      fullName,
      config,
      routeCustomFields,
      pendingCanActivate,
      pendingCanDeactivate,
      depsStore,
    );

    if (route.children) {
      registerAllRouteHandlers(
        route.children,
        config,
        routeCustomFields,
        pendingCanActivate,
        pendingCanDeactivate,
        depsStore,
        fullName,
      );
    }
  }
}
