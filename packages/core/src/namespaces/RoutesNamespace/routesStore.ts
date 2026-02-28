// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { logger } from "@real-router/logger";
import { createMatcher, createRouteTree, nodeToDefinition } from "route-tree";

import { DEFAULT_ROUTE_NAME } from "./constants";
import { resolveForwardChain } from "./forwardToValidation";
import { createEmptyConfig, sanitizeRoute } from "./helpers";
import { validateRoutes } from "./validators";

import type { RouteConfig, RoutesDependencies } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type { DefaultDependencies, Params } from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "route-tree";

// =============================================================================
// Interfaces
// =============================================================================

export interface RoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly definitions: RouteDefinition[];
  readonly config: RouteConfig;
  tree: RouteTree;
  matcher: Matcher;
  resolvedForwardMap: Record<string, string>;
  routeCustomFields: Record<string, Record<string, unknown>>;
  rootPath: string;
  readonly matcherOptions: CreateMatcherOptions | undefined;
  depsStore: RoutesDependencies<Dependencies> | undefined;
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies> | undefined;
  readonly pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly treeOperations: {
    readonly commitTreeChanges: (
      store: RoutesStore<Dependencies>,
      noValidate: boolean,
    ) => void;
    readonly resetStore: (store: RoutesStore<Dependencies>) => void;
    readonly nodeToDefinition: (node: RouteTree) => RouteDefinition;
    readonly validateRoutes: (
      routes: Route<Dependencies>[],
      tree?: RouteTree,
      forwardMap?: Record<string, string>,
      parentName?: string,
    ) => void;
  };
}

// =============================================================================
// Tree operations
// =============================================================================

function rebuildTree(
  definitions: RouteDefinition[],
  rootPath: string,
  matcherOptions: CreateMatcherOptions | undefined,
): { tree: RouteTree; matcher: Matcher } {
  const tree = createRouteTree(DEFAULT_ROUTE_NAME, rootPath, definitions);
  const matcher = createMatcher(matcherOptions);

  matcher.registerTree(tree);

  return { tree, matcher };
}

export function commitTreeChanges<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>, noValidate: boolean): void {
  const result = rebuildTree(
    store.definitions,
    store.rootPath,
    store.matcherOptions,
  );

  store.tree = result.tree;
  store.matcher = result.matcher;
  store.resolvedForwardMap = refreshForwardMap(store.config, noValidate);
}

export function rebuildTreeInPlace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  const result = rebuildTree(
    store.definitions,
    store.rootPath,
    store.matcherOptions,
  );

  store.tree = result.tree;
  store.matcher = result.matcher;
}

// =============================================================================
// Store reset
// =============================================================================

/**
 * Clears all routes and resets config.
 * Does NOT clear lifecycle handlers or state — caller handles that.
 */
export function resetStore<
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

export function clearRouteData<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(store: RoutesStore<Dependencies>): void {
  store.definitions.length = 0;

  Object.assign(store.config, createEmptyConfig());

  store.resolvedForwardMap = Object.create(null) as Record<string, string>;
  store.routeCustomFields = Object.create(null) as Record<
    string,
    Record<string, unknown>
  >;
}

// =============================================================================
// Forward map
// =============================================================================

export function refreshForwardMap(
  config: RouteConfig,
  noValidate: boolean,
): Record<string, string> {
  if (noValidate) {
    return cacheForwardMap(config);
  }

  return validateAndCacheForwardMap(config);
}

function validateAndCacheForwardMap(
  config: RouteConfig,
): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;

  for (const fromRoute of Object.keys(config.forwardMap)) {
    map[fromRoute] = resolveForwardChain(fromRoute, config.forwardMap);
  }

  return map;
}

function cacheForwardMap(config: RouteConfig): Record<string, string> {
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

// =============================================================================
// Route handler registration
// =============================================================================

function registerForwardTo<Dependencies extends DefaultDependencies>(
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

function registerSingleRouteHandlers<Dependencies extends DefaultDependencies>(
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

// =============================================================================
// Factory
// =============================================================================

export function createRoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: Route<Dependencies>[],
  noValidate: boolean,
  matcherOptions?: CreateMatcherOptions,
): RoutesStore<Dependencies> {
  const definitions: RouteDefinition[] = [];
  const config: RouteConfig = createEmptyConfig();
  const routeCustomFields: Record<
    string,
    Record<string, unknown>
  > = Object.create(null) as Record<string, Record<string, unknown>>;
  const pendingCanActivate = new Map<string, GuardFnFactory<Dependencies>>();
  const pendingCanDeactivate = new Map<string, GuardFnFactory<Dependencies>>();

  for (const route of routes) {
    definitions.push(sanitizeRoute(route));
  }

  const { tree, matcher } = rebuildTree(definitions, "", matcherOptions);

  registerAllRouteHandlers(
    routes,
    config,
    routeCustomFields,
    pendingCanActivate,
    pendingCanDeactivate,
    undefined,
    "",
  );

  const resolvedForwardMap: Record<string, string> = noValidate
    ? cacheForwardMap(config)
    : validateAndCacheForwardMap(config);

  return {
    definitions,
    config,
    tree,
    matcher,
    resolvedForwardMap,
    routeCustomFields,
    rootPath: "",
    matcherOptions,
    depsStore: undefined,
    lifecycleNamespace: undefined,
    pendingCanActivate,
    pendingCanDeactivate,
    treeOperations: {
      commitTreeChanges,
      resetStore,
      nodeToDefinition,
      validateRoutes,
    },
  };
}
