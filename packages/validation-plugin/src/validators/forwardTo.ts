// packages/validation-plugin/src/validators/forwardTo.ts

import { resolveForwardChain } from "@real-router/core";
import { getSegmentsByName } from "route-tree";
import { getTypeDescription } from "type-guards";

import type { Route, DefaultDependencies } from "@real-router/core";
import type { RouteTree } from "route-tree";

// ============================================================================
// Route Property Validation
// ============================================================================

function validateForwardToProperty(forwardTo: unknown, fullName: string): void {
  if (forwardTo === undefined) {
    return;
  }

  if (typeof forwardTo === "function") {
    const isNativeAsync =
      (forwardTo as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction";
    const isTranspiledAsync = forwardTo.toString().includes("__awaiter");

    if (isNativeAsync || isTranspiledAsync) {
      throw new TypeError(
        `[router.addRoute] forwardTo callback cannot be async for route "${fullName}". ` +
          `Async functions break matchPath/buildPath.`,
      );
    }
  }
}

export function validateRouteProperties<
  Dependencies extends DefaultDependencies,
>(route: Route<Dependencies>, fullName: string): void {
  if (
    route.canActivate !== undefined &&
    typeof route.canActivate !== "function"
  ) {
    throw new TypeError(
      `[router.addRoute] canActivate must be a function for route "${fullName}", ` +
        `got ${getTypeDescription(route.canActivate)}`,
    );
  }

  if (
    route.canDeactivate !== undefined &&
    typeof route.canDeactivate !== "function"
  ) {
    throw new TypeError(
      `[router.addRoute] canDeactivate must be a function for route "${fullName}", ` +
        `got ${getTypeDescription(route.canDeactivate)}`,
    );
  }

  if (route.defaultParams !== undefined) {
    const params: unknown = route.defaultParams;

    if (
      params === null ||
      typeof params !== "object" ||
      Array.isArray(params)
    ) {
      throw new TypeError(
        `[router.addRoute] defaultParams must be an object for route "${fullName}", ` +
          `got ${getTypeDescription(route.defaultParams)}`,
      );
    }
  }

  if (route.decodeParams?.constructor.name === "AsyncFunction") {
    throw new TypeError(
      `[router.addRoute] decodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  if (route.encodeParams?.constructor.name === "AsyncFunction") {
    throw new TypeError(
      `[router.addRoute] encodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`,
    );
  }

  validateForwardToProperty(route.forwardTo, fullName);

  if (route.children) {
    for (const child of route.children) {
      const childFullName = `${fullName}.${child.name}`;

      validateRouteProperties(child, childFullName);
    }
  }
}

// ============================================================================
// ForwardTo Validation
// ============================================================================

function extractParamsFromPath(path: string): Set<string> {
  const params = new Set<string>();
  const paramRegex = /[*:]([A-Z_a-z]\w*)/g;
  let match;

  while ((match = paramRegex.exec(path)) !== null) {
    params.add(match[1]);
  }

  return params;
}

function extractParamsFromPaths(paths: readonly string[]): Set<string> {
  const params = new Set<string>();

  for (const path of paths) {
    for (const param of extractParamsFromPath(path)) {
      params.add(param);
    }
  }

  return params;
}

function collectPathsToRoute<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  routeName: string,
  parentName = "",
  paths: string[] = [],
): string[] {
  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;
    const currentPaths = [...paths, route.path];

    if (fullName === routeName) {
      return currentPaths;
    }

    if (route.children && routeName.startsWith(`${fullName}.`)) {
      return collectPathsToRoute(
        route.children,
        routeName,
        fullName,
        currentPaths,
      );
    }
  }

  /* v8 ignore next -- @preserve unreachable: callers validate existence */
  throw new Error(
    `[internal] collectPathsToRoute: route "${routeName}" not found`,
  );
}

function collectRouteNames<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName = "",
): Set<string> {
  const names = new Set<string>();

  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    names.add(fullName);

    if (route.children) {
      for (const childName of collectRouteNames(route.children, fullName)) {
        names.add(childName);
      }
    }
  }

  return names;
}

function collectForwardMappings<Dependencies extends DefaultDependencies>(
  routes: readonly Route<Dependencies>[],
  parentName = "",
): Map<string, string> {
  const mappings = new Map<string, string>();

  for (const route of routes) {
    const fullName = parentName ? `${parentName}.${route.name}` : route.name;

    if (route.forwardTo && typeof route.forwardTo === "string") {
      mappings.set(fullName, route.forwardTo);
    }

    if (route.children) {
      for (const [key, value] of collectForwardMappings(
        route.children,
        fullName,
      )) {
        mappings.set(key, value);
      }
    }
  }

  return mappings;
}

function getRequiredParams(segments: readonly RouteTree[]): Set<string> {
  const params = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.add(param);
    }

    for (const param of segment.paramMeta.spatParams) {
      params.add(param);
    }
  }

  return params;
}

function routeExistsInTree(tree: RouteTree, routeName: string): boolean {
  const segments = routeName.split(".");
  let current: RouteTree | undefined = tree;

  for (const segment of segments) {
    current = current.children.get(segment);

    if (!current) {
      return false;
    }
  }

  return true;
}

function getTargetParams<Dependencies extends DefaultDependencies>(
  targetRoute: string,
  existsInTree: boolean,
  tree: RouteTree,
  routes: readonly Route<Dependencies>[],
): Set<string> {
  if (existsInTree) {
    /* v8 ignore next -- @preserve: ?? fallback unreachable — existsInTree guarantees non-null */
    return getRequiredParams(getSegmentsByName(tree, targetRoute) ?? []);
  }

  return extractParamsFromPaths(collectPathsToRoute(routes, targetRoute));
}

function validateSingleForward<Dependencies extends DefaultDependencies>(
  fromRoute: string,
  targetRoute: string,
  routes: readonly Route<Dependencies>[],
  batchNames: Set<string>,
  tree: RouteTree,
): void {
  const existsInTree = routeExistsInTree(tree, targetRoute);
  const existsInBatch = batchNames.has(targetRoute);

  if (!existsInTree && !existsInBatch) {
    throw new Error(
      `[router.addRoute] forwardTo target "${targetRoute}" does not exist ` +
        `for route "${fromRoute}"`,
    );
  }

  const fromParams = extractParamsFromPaths(
    collectPathsToRoute(routes, fromRoute),
  );

  const toParams = getTargetParams(targetRoute, existsInTree, tree, routes);

  const missingParams = [...toParams].filter((p) => !fromParams.has(p));

  if (missingParams.length > 0) {
    throw new Error(
      `[router.addRoute] forwardTo target "${targetRoute}" requires params ` +
        `[${missingParams.join(", ")}] that are not available in source route "${fromRoute}"`,
    );
  }
}

export function validateForwardToTargets<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  existingForwardMap: Record<string, string>,
  tree: RouteTree,
): void {
  const batchNames = collectRouteNames(routes);
  const batchForwards = collectForwardMappings(routes);

  const combinedForwardMap: Record<string, string> = { ...existingForwardMap };

  for (const [from, to] of batchForwards) {
    combinedForwardMap[from] = to;
  }

  for (const [fromRoute, targetRoute] of batchForwards) {
    validateSingleForward(fromRoute, targetRoute, routes, batchNames, tree);
  }

  for (const fromRoute of Object.keys(combinedForwardMap)) {
    resolveForwardChain(fromRoute, combinedForwardMap);
  }
}
