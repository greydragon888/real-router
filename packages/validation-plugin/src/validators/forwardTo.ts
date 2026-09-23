// packages/validation-plugin/src/validators/forwardTo.ts

import { resolveForwardChain } from "@real-router/core";
import { internalDefect, raiser, putField } from "@real-router/core/utils";

import { getTypeDescription } from "../type-guards";

import type { Route, DefaultDependencies } from "@real-router/core";

const atAddRoute = raiser("router", "addRoute");

/**
 * What a route validator asks about routes that ALREADY exist (#2382).
 *
 * ⚑ Two questions, both answered from the curated surface: existence walks
 * `PluginApi.getTree()`, and the path slots come from `PluginApi.getUrlParams`.
 * These validators need exactly these two answers about routes that already
 * exist, and both are data — so the route matcher is not handed to them.
 */
export interface RouteLookup {
  hasRoute: (name: string) => boolean;
  getUrlParams: (name: string) => readonly string[];
}

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;

// ============================================================================
// Route Property Validation
// ============================================================================

function validateForwardToProperty(forwardTo: unknown, fullName: string): void {
  if (forwardTo === undefined) {
    return;
  }

  // ⚑ The TYPE, not only the async-ness (#1787). Without it a number reaches the
  // async branch's `typeof` test, fails it, and leaves the function — measured,
  // and the reason this door admitted what `update` refuses.
  if (typeof forwardTo !== "string" && typeof forwardTo !== "function") {
    throw atAddRoute.type`forwardTo must be a string or function for route "${fullName}", got ${getTypeDescription(forwardTo)}`;
  }

  if (typeof forwardTo === "function") {
    const isNativeAsync =
      (forwardTo as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction";
    const isTranspiledAsync = forwardTo.toString().includes("__awaiter");

    if (isNativeAsync || isTranspiledAsync) {
      throw atAddRoute.type`forwardTo callback cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`;
    }
  }
}

/**
 * A route's own default bag: a plain object, or absent. Read with `typeof` and
 * `Array.isArray` only — the bag belongs to the application and may be
 * Proxy-backed, so a check that enumerated it would invoke its accessors.
 */
function assertPlainBag(
  bag: unknown,
  slot: "defaultParams" | "defaultSearch",
  fullName: string,
): void {
  if (bag === undefined) {
    return;
  }

  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) {
    throw atAddRoute.type`${slot} must be an object for route "${fullName}", got ${getTypeDescription(bag)}`;
  }
}

export function validateRouteProperties<
  Dependencies extends DefaultDependencies,
>(route: Route<Dependencies>, fullName: string): void {
  if (
    route.canActivate !== undefined &&
    typeof route.canActivate !== "function"
  ) {
    throw atAddRoute.type`canActivate must be a function for route "${fullName}", got ${getTypeDescription(route.canActivate)}`;
  }

  if (
    route.canDeactivate !== undefined &&
    typeof route.canDeactivate !== "function"
  ) {
    throw atAddRoute.type`canDeactivate must be a function for route "${fullName}", got ${getTypeDescription(route.canDeactivate)}`;
  }

  assertPlainBag(route.defaultParams, "defaultParams", fullName);
  // ⚑ `Route.defaultSearch` is a `SearchParams` bag, unlike `Options.defaultSearch`
  // which may legally be a callback — the two slots spell the same name and the
  // predicate must not be shared (#1787).
  assertPlainBag(route.defaultSearch, "defaultSearch", fullName);

  if (route.decodeParams?.constructor.name === "AsyncFunction") {
    throw atAddRoute.type`decodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`;
  }

  if (route.encodeParams?.constructor.name === "AsyncFunction") {
    throw atAddRoute.type`encodeParams cannot be async for route "${fullName}". Async functions break matchPath/buildPath.`;
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
      // eslint-disable-next-line unicorn/no-useless-recursion -- intentional route-tree descent; a loop rewrite needs a labeled break and obscures path resolution
      return collectPathsToRoute(
        route.children,
        routeName,
        fullName,
        currentPaths,
      );
    }
  }

  /* v8 ignore next -- @preserve unreachable: callers validate existence */
  throw internalDefect.plain`collectPathsToRoute: route "${routeName}" not found`;
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

function getTargetParams<Dependencies extends DefaultDependencies>(
  targetRoute: string,
  exists: boolean,
  lookup: RouteLookup,
  routes: readonly Route<Dependencies>[],
): Set<string> {
  if (exists) {
    return new Set(lookup.getUrlParams(targetRoute));
  }

  return extractParamsFromPaths(collectPathsToRoute(routes, targetRoute));
}

const EMPTY_PARENT_PARAMS: ReadonlySet<string> = new Set();

function validateSingleForward<Dependencies extends DefaultDependencies>(
  fromRoute: string,
  targetRoute: string,
  routes: readonly Route<Dependencies>[],
  batchNames: Set<string>,
  lookup: RouteLookup,
  parentParams: ReadonlySet<string>,
): void {
  const exists = lookup.hasRoute(targetRoute);
  const existsInBatch = batchNames.has(targetRoute);

  if (!exists && !existsInBatch) {
    throw atAddRoute.ref`forwardTo target "${targetRoute}" does not exist for route "${fromRoute}"`;
  }

  // A batch route added under { parent } inherits the parent's path params, so
  // the forward source's available params are the parent's plus its own (#1224).
  const fromParams = new Set<string>([
    ...parentParams,
    ...extractParamsFromPaths(collectPathsToRoute(routes, fromRoute)),
  ]);

  const toParams = getTargetParams(targetRoute, exists, lookup, routes);

  const missingParams = [...toParams].filter((param) => !fromParams.has(param));

  if (missingParams.length > 0) {
    throw atAddRoute.plain`forwardTo target "${targetRoute}" requires params [${missingParams.join(", ")}] that are not available in source route "${fromRoute}"`;
  }
}

export function validateForwardToTargets<
  Dependencies extends DefaultDependencies,
>(
  routes: readonly Route<Dependencies>[],
  existingForwardMap: Readonly<Record<string, string>>,
  lookup: RouteLookup,
  parentName?: string,
): void {
  const batchNames = collectRouteNames(routes);
  // Added under { parent }, a batch route's full name is `${parent}.${short}` and
  // it inherits the parent's path params — resolve both from the parent (#1224).
  const batchFullNames = parentName
    ? new Set([...batchNames].map((name) => `${parentName}.${name}`))
    : batchNames;
  // `validateRoutes` throws on a missing parent before forwardTo validation runs,
  // so these are the parent's own slots, never the empty answer `getUrlParams`
  // gives for a route the tree does not hold.
  const parentParams: ReadonlySet<string> = parentName
    ? new Set(lookup.getUrlParams(parentName))
    : EMPTY_PARENT_PARAMS;

  const batchForwards = collectForwardMappings(routes);

  const combinedForwardMap: Record<string, string> = { ...existingForwardMap };

  for (const [from, to] of batchForwards) {
    // A ROUTE NAME as the key (#1852): an ambient accessor under it made
    // `routesApi.add()` throw, so the routes were never registered — the
    // validator becoming the failure.
    putField(combinedForwardMap, from, to);
  }

  for (const [fromRoute, targetRoute] of batchForwards) {
    validateSingleForward(
      fromRoute,
      targetRoute,
      routes,
      batchFullNames,
      lookup,
      parentParams,
    );
  }

  for (const fromRoute of objectKeys(combinedForwardMap)) {
    resolveForwardChain(fromRoute, combinedForwardMap);
  }
}
