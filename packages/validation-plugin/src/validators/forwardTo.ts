// packages/validation-plugin/src/validators/forwardTo.ts

import { resolveForwardChain } from "@real-router/core";
import { putField } from "@real-router/core/utils";

import { getTypeDescription } from "../type-guards";

import type { Route, DefaultDependencies } from "@real-router/core";
import type { Matcher, RouteTree } from "@real-router/core/validation";

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

  // ⚑ The TYPE, not only the async-ness (#1787). `update` has always checked it;
  // this door saw a number fall through to the async branch's `typeof` test and
  // out the other side.
  if (typeof forwardTo !== "string" && typeof forwardTo !== "function") {
    throw new TypeError(
      `[router.addRoute] forwardTo must be a string or function for route "${fullName}", ` +
        `got ${getTypeDescription(forwardTo)}`,
    );
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
    throw new TypeError(
      `[router.addRoute] ${slot} must be an object for route "${fullName}", ` +
        `got ${getTypeDescription(bag)}`,
    );
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

  assertPlainBag(route.defaultParams, "defaultParams", fullName);
  // ⚑ `Route.defaultSearch` is a `SearchParams` bag, unlike `Options.defaultSearch`
  // which may legally be a callback — the two slots spell the same name and the
  // predicate must not be shared (#1787).
  assertPlainBag(route.defaultSearch, "defaultSearch", fullName);

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
  }

  return params;
}

function getTargetParams<Dependencies extends DefaultDependencies>(
  targetRoute: string,
  existsInMatcher: boolean,
  matcher: Matcher,
  routes: readonly Route<Dependencies>[],
): Set<string> {
  if (existsInMatcher) {
    /* v8 ignore next -- @preserve: ?? fallback unreachable — existsInMatcher guarantees non-null */
    return getRequiredParams(
      (matcher.getSegmentsByName(targetRoute) as
        readonly RouteTree[] | undefined) ?? [],
    );
  }

  return extractParamsFromPaths(collectPathsToRoute(routes, targetRoute));
}

const EMPTY_PARENT_PARAMS: ReadonlySet<string> = new Set();

function validateSingleForward<Dependencies extends DefaultDependencies>(
  fromRoute: string,
  targetRoute: string,
  routes: readonly Route<Dependencies>[],
  batchNames: Set<string>,
  matcher: Matcher,
  parentParams: ReadonlySet<string>,
): void {
  const existsInMatcher = matcher.hasRoute(targetRoute);
  const existsInBatch = batchNames.has(targetRoute);

  if (!existsInMatcher && !existsInBatch) {
    throw new ReferenceError(
      `[router.addRoute] forwardTo target "${targetRoute}" does not exist ` +
        `for route "${fromRoute}"`,
    );
  }

  // A batch route added under { parent } inherits the parent's path params, so
  // the forward source's available params are the parent's plus its own (#1224).
  const fromParams = new Set<string>([
    ...parentParams,
    ...extractParamsFromPaths(collectPathsToRoute(routes, fromRoute)),
  ]);

  const toParams = getTargetParams(
    targetRoute,
    existsInMatcher,
    matcher,
    routes,
  );

  const missingParams = [...toParams].filter((param) => !fromParams.has(param));

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
  matcher: Matcher,
  parentName?: string,
): void {
  const batchNames = collectRouteNames(routes);
  // Added under { parent }, a batch route's full name is `${parent}.${short}` and
  // it inherits the parent's path params — resolve both from the parent (#1224).
  const batchFullNames = parentName
    ? new Set([...batchNames].map((name) => `${parentName}.${name}`))
    : batchNames;
  // `validateRoutes` throws on a missing parent before forwardTo validation runs
  // (both go through the `add({ parent })` path with tree + matcher present), so
  // the parent's segments are always resolvable here — assert non-null.
  const parentParams: ReadonlySet<string> = parentName
    ? getRequiredParams(
        matcher.getSegmentsByName(parentName) as readonly RouteTree[],
      )
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
      matcher,
      parentParams,
    );
  }

  for (const fromRoute of objectKeys(combinedForwardMap)) {
    resolveForwardChain(fromRoute, combinedForwardMap);
  }
}
