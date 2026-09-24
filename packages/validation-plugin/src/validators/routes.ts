// packages/validation-plugin/src/validators/routes.ts

/**
 * DX-only validator functions for RoutesNamespace.
 * Copied from packages/core/src/namespaces/RoutesNamespace/validators.ts
 * (excludes validateRemoveRoute/validateClearRoutes — those are in routeGuards.ts)
 */

import { resolveForwardChain } from "@real-router/core";
import { raiser } from "@real-router/core/utils";
import {
  findMisChanneledKey,
  validateRoute,
} from "@real-router/core/validation";

import {
  isString,
  validateRouteName,
  isParams,
  getTypeDescription,
} from "../type-guards";
import { validateForwardToTargets, validateRouteProperties } from "./forwardTo";
import { validateNavigateParamsShape } from "./navigation";

import type { RouteLookup } from "./forwardTo";
import type {
  ForwardToCallback,
  Params,
  Route,
  RouteConfigUpdate,
  DefaultDependencies,
} from "@real-router/core";
import type { RouteTree } from "@real-router/core/validation";

const atUpdateRoute = raiser("router", "updateRoute");
const atAddRoute = raiser("router", "addRoute");
const atShouldUpdateNode = raiser("router", "shouldUpdateNode");
const atMatchPath = raiser("router", "matchPath");
const atBuildPath = raiser("router", "buildPath");
const atIsActiveRoute = raiser("router", "isActiveRoute");
const atSetRootPath = raiser("router", "setRootPath");

// Internal constant (matches core's INTERNAL_ROUTE_PREFIX)
const INTERNAL_ROUTE_PREFIX = "@@";

export function throwIfInternalRoute(name: string, methodName: string): void {
  if (name.startsWith(INTERNAL_ROUTE_PREFIX)) {
    const at = raiser("router", methodName);

    throw at.plain`Route name "${name}" uses the reserved "${INTERNAL_ROUTE_PREFIX}" prefix. Routes with this prefix are internal and cannot be modified through the public API.`;
  }
}

export function throwIfInternalRouteInArray(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Route type
  routes: readonly Route<any>[],
  methodName: string,
): void {
  for (const route of routes) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety guard
    if (route && typeof route === "object" && typeof route.name === "string") {
      throwIfInternalRoute(route.name, methodName);

      if (route.children) {
        throwIfInternalRouteInArray(route.children, methodName);
      }
    }
  }
}

/**
 * Validates removeRoute arguments.
 */
export function validateRemoveRouteArgs(name: unknown): asserts name is string {
  validateRouteName(name, "removeRoute");
}

export function validateSetRootPathArgs(
  rootPath: unknown,
): asserts rootPath is string {
  if (typeof rootPath !== "string") {
    throw atSetRootPath.type`rootPath must be a string, got ${getTypeDescription(rootPath)}`;
  }
}

function isAsyncFunction(fn: unknown): boolean {
  return (
    (fn as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction" || String(fn).includes("__awaiter")
  );
}

export function guardRouteCallbacks(route: unknown): void {
  const routeObj = route as { canActivate?: unknown; canDeactivate?: unknown };

  if (
    routeObj.canActivate !== undefined &&
    typeof routeObj.canActivate !== "function"
  ) {
    throw atAddRoute.type`canActivate must be a function, got ${getTypeDescription(routeObj.canActivate)}`;
  }

  if (
    routeObj.canDeactivate !== undefined &&
    typeof routeObj.canDeactivate !== "function"
  ) {
    throw atAddRoute.type`canDeactivate must be a function, got ${getTypeDescription(routeObj.canDeactivate)}`;
  }
}

export function guardNoAsyncCallbacks(route: unknown): void {
  const routeObj = route as {
    decodeParams?: unknown;
    encodeParams?: unknown;
    forwardTo?: unknown;
    name?: unknown;
  };
  const routeName = routeObj.name;

  // Only a function is asked whether it is async: any other codec is
  // `validateRoute`'s to refuse, and `isAsyncFunction` reads its `constructor`.
  if (
    typeof routeObj.decodeParams === "function" &&
    isAsyncFunction(routeObj.decodeParams)
  ) {
    throw atAddRoute.type`decodeParams cannot be async for route "${String(routeName)}"`;
  }

  if (
    typeof routeObj.encodeParams === "function" &&
    isAsyncFunction(routeObj.encodeParams)
  ) {
    throw atAddRoute.type`encodeParams cannot be async for route "${String(routeName)}"`;
  }

  if (
    typeof routeObj.forwardTo === "function" &&
    isAsyncFunction(routeObj.forwardTo)
  ) {
    throw atAddRoute.type`forwardTo callback cannot be async for route "${String(routeName)}"`;
  }
}

/**
 * Validates addRoute arguments (route structure and properties).
 * State-dependent validation (duplicates, tree) happens in instance method.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any Route type
export function validateAddRouteArgs(routes: readonly Route<any>[]): void {
  for (const route of routes) {
    // First check if route is an object (before accessing route.name)
    // Runtime check for invalid types passed via `as any`
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check
    if (route === null || typeof route !== "object" || Array.isArray(route)) {
      throw atAddRoute.type`Route must be an object, got ${getTypeDescription(route)}`;
    }

    // Validate route properties (canActivate, canDeactivate, defaultParams, async checks)
    // Note: validateRouteProperties handles children recursively
    validateRouteProperties(route, route.name);
  }
}

/**
 * Validates parent option for addRoute.
 */
export function validateParentOption(
  parent: unknown,
): asserts parent is string {
  if (typeof parent !== "string" || parent === "") {
    throw atAddRoute.type`parent option must be a non-empty string, got ${getTypeDescription(parent)}`;
  }

  // Validate parent is a valid route name format (can contain dots — it's a fullName reference)
  validateRouteName(parent, "addRoute");
}

/**
 * Validates isActiveRoute arguments.
 *
 * ⚑ **The path bag is judged by SHAPE only, and the missing value walk is the
 * point (#2134).** This door returns a boolean and ships nothing out of the bag,
 * so there is no shipped value for a judged one to disagree with — what a value
 * walk buys here is a call into the application's accessors on a door where bare
 * core makes none. Measured: an inactive link reads the bag zero times without
 * this plugin, and an adapter's `<Link>` asks this predicate on every render.
 *
 * ⚠ **The answer is bare core's, not a weaker one.** Bare core answers `false`
 * for a `Symbol`, a function, a `BigInt` or a cyclic bag — the values are
 * compared, never printed, and a value the active state cannot hold cannot match
 * it. The plugin agrees with that answer rather than raising over it.
 *
 * ⚠ **The sibling predicate `canNavigateTo` still runs the value walk, and the
 * two are not required to agree.** They already do not: a control character in
 * a param makes `canNavigateTo` throw while this door answers `false`, and a
 * throwing accessor does the reverse. The difference is what each door does with
 * the bag — `canNavigateTo` builds a path from it, this one compares it.
 */
export function validateIsActiveRouteArgs(
  name: unknown,
  params: unknown,
  strictEquality: unknown,
  ignoreQueryParams: unknown,
): asserts name is string {
  // Validate name - non-string throws
  if (!isString(name)) {
    throw atIsActiveRoute.type`name must be a string, got ${typeof name}`;
  }

  // The shape half only — same rule, same message, one spelling.
  validateNavigateParamsShape(params, "isActiveRoute");

  // Validate strictEquality if provided
  if (strictEquality !== undefined && typeof strictEquality !== "boolean") {
    throw atIsActiveRoute.type`strictEquality must be a boolean, got ${typeof strictEquality}`;
  }

  // Validate ignoreQueryParams if provided
  if (
    ignoreQueryParams !== undefined &&
    typeof ignoreQueryParams !== "boolean"
  ) {
    throw atIsActiveRoute.type`ignoreQueryParams must be a boolean, got ${typeof ignoreQueryParams}`;
  }
}

/**
 * Validates state-builder arguments (navigate / forwardState /
 * buildNavigationState).
 */
export function validateStateBuilderArgs(
  routeName: unknown,
  routeParams: unknown,
  methodName: string,
): void {
  if (!isString(routeName)) {
    const at = raiser("router", methodName);

    throw at.type`Invalid routeName: ${getTypeDescription(routeName)}. Expected string.`;
  }

  if (!isParams(routeParams)) {
    const at = raiser("router", methodName);

    throw at.type`Invalid routeParams: ${getTypeDescription(routeParams)}. Expected plain object.`;
  }
}

/**
 * Validates updateRoute basic arguments (name and updates object structure).
 * Does NOT read property values to allow caller to cache them first.
 */
export function validateUpdateRouteBasicArgs<
  Dependencies extends DefaultDependencies,
>(
  name: unknown,
  updates: unknown,
): asserts updates is RouteConfigUpdate<Dependencies> {
  // Validate name
  validateRouteName(name, "updateRoute");

  if (name === "") {
    throw atUpdateRoute.ref`Invalid name: empty string. Cannot update root node.`;
  }

  // Validate updates is not null

  if (updates === null) {
    throw atUpdateRoute.type`updates must be an object, got null`;
  }

  // Validate updates is an object (not array)
  if (typeof updates !== "object" || Array.isArray(updates)) {
    throw atUpdateRoute.type`updates must be an object, got ${getTypeDescription(updates)}`;
  }
}

/**
 * Asserts that a function is not async (native or transpiled).
 * Checks both constructor name and toString() for __awaiter pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- needs constructor.name access
function assertNotAsync(value: Function, paramName: string): void {
  if (
    (value as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction" ||
    (value as { toString: () => string }).toString().includes("__awaiter")
  ) {
    throw atUpdateRoute.type`${paramName} cannot be an async function`;
  }
}

/**
 * Validates that a value is a non-async function, if provided.
 */
function validateFunctionParam(value: unknown, paramName: string): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "function") {
    throw atUpdateRoute.type`${paramName} must be a function or null, got ${typeof value}`;
  }

  assertNotAsync(value, paramName);
}

/**
 * Validates updateRoute property types using pre-cached values.
 * Called AFTER properties are cached to ensure getters are called only once.
 */
export function validateUpdateRoutePropertyTypes(cached: {
  forwardTo: unknown;
  defaultParams: unknown;
  defaultSearch: unknown;
  decodeParams: unknown;
  encodeParams: unknown;
  canActivate: unknown;
  canDeactivate: unknown;
}): void {
  const {
    forwardTo,
    defaultParams,
    defaultSearch,
    decodeParams,
    encodeParams,
    canActivate,
    canDeactivate,
  } = cached;

  // Validate forwardTo type (existence check is done by instance method)
  if (forwardTo !== undefined && forwardTo !== null) {
    if (typeof forwardTo !== "string" && typeof forwardTo !== "function") {
      throw atUpdateRoute.type`forwardTo must be a string, function, or null, got ${getTypeDescription(forwardTo)}`;
    }

    if (typeof forwardTo === "function") {
      assertNotAsync(forwardTo, "forwardTo callback");
    }
  }

  validateBagParam(defaultParams, "defaultParams");
  // ⚑ The patch slot mirrors `Route.defaultSearch` — a bag, never a callback.
  // `Options.defaultSearch` is the one that may be a function, and it is a
  // different door with a different validator (#1787).
  validateBagParam(defaultSearch, "defaultSearch");

  validateFunctionParam(decodeParams, "decodeParams");
  validateFunctionParam(encodeParams, "encodeParams");
  // ⚑ `RouteConfigUpdate` declares these as `GuardFnFactory | null`, with no
  // boolean — unlike `addActivateGuard`, whose handler may be one. A shared
  // predicate would break that door.
  validateFunctionParam(canActivate, "canActivate");
  validateFunctionParam(canDeactivate, "canDeactivate");
}

/** A patch's default bag: a plain object, `null` to remove, or absent. */
function validateBagParam(
  value: unknown,
  paramName: "defaultParams" | "defaultSearch",
): void {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== "object" || Array.isArray(value))
  ) {
    throw atUpdateRoute.type`${paramName} must be an object or null, got ${getTypeDescription(value)}`;
  }
}

/**
 * Validates buildPath arguments.
 */
export function validateBuildPathArgs(route: unknown): asserts route is string {
  if (!isString(route) || route === "") {
    throw atBuildPath.type`route must be a non-empty string, got ${typeof route === "string" ? '""' : typeof route}`;
  }
}

/**
 * The retired single-bag spelling, reported at the doors that stay silent about
 * it (#2238).
 *
 * A declared QUERY name carrying a value in the PATH bag is the v1 spelling the
 * channel split retired. The committing doors already answer — `navigate` throws
 * `WRONG_CHANNEL`, `canNavigateTo` returns `false` — but `buildPath` prints an
 * href without the key and `isActiveRoute` judges the location that href
 * describes. Both are right about their own question, and both leave the caller
 * with a wrong URL in the DOM that only a plain left-click ever complains about:
 * a ⌘-click, a copied link and SSR markup all follow it in silence.
 *
 * ⚠ **A warning, not a throw.** Neither door has an error channel — one returns a
 * string, the other a boolean — and #2124 measured that wiring core's guard here
 * changes an ANSWER rather than revealing a silence.
 *
 * ⚠ **The predicate comes from core, it is not re-derived.** `findMisChanneledKey`
 * carries three carve-outs a copy would lose, and this package has already paid
 * for a mirrored rule drifting from its original (#1224 / #1225).
 *
 * De-duplicated per `route + key`, on a cache owned by the VALIDATOR object and
 * so by the router (#1583) — the same shape, and the same reason, as the mode
 * gate's reporter one file over.
 */
export function createMisChanneledKeyReporter(
  queryNamesOf: (routeName: string) => readonly string[],
): (routeName: string, params: unknown) => void {
  const reported = new Set<string>();

  return function reportMisChanneledKey(
    routeName: string,
    params: unknown,
  ): void {
    // No name guard and no `try`: every caller runs the door's own validator
    // first, which throws on anything but a non-empty string, and
    // `getQueryParams` answers `[]` for a name the router does not hold rather
    // than throwing — measured, not assumed. A branch neither reachable nor
    // provable is a coverage hole with a comment attached.
    const key = findMisChanneledKey(
      params as Params | undefined,
      queryNamesOf(routeName),
    );

    if (key === undefined) {
      return;
    }

    const seen = `${routeName} ${key}`;

    if (reported.has(seen)) {
      return;
    }

    reported.add(seen);

    console.warn(
      `[router] Route "${routeName}" declares \`${key}\` as a query param, but it was given in the ` +
        `\`params\` bag — the path channel. The URL is built without it, so the href does not match ` +
        `what you asked for; a plain click throws, but a ⌘-click, a copied link and server-rendered ` +
        `markup all follow the wrong URL in silence. Pass it in \`search\` instead.`,
    );
  };
}

/**
 * Validates matchPath arguments.
 */
export function validateMatchPathArgs(path: unknown): asserts path is string {
  if (!isString(path)) {
    throw atMatchPath.type`path must be a string, got ${typeof path}`;
  }
}

/**
 * Validates shouldUpdateNode arguments.
 */
export function validateShouldUpdateNodeArgs(
  nodeName: unknown,
): asserts nodeName is string {
  if (!isString(nodeName)) {
    throw atShouldUpdateNode.type`nodeName must be a string, got ${typeof nodeName}`;
  }
}

/**
 * Validates a batch against the table it joins.
 * Checks parent existence, duplicates, and forwardTo targets/cycles.
 *
 * The table is the registered one for `add`, and an empty one under the kept
 * root for `replace` (#2562) — `validationPlugin.ts` picks it per door.
 *
 * @param routes - Routes to validate
 * @param tree - The tree of the table the batch joins
 * @param lookup - Existence and path slots of that table's routes
 * @param forwardMap - That table's ONE-HOP forward map
 * @param parentName - Optional parent route fullName for nesting via addRoute({ parent })
 */
export function validateRoutes<Dependencies extends DefaultDependencies>(
  routes: Route<Dependencies>[],
  tree: RouteTree,
  lookup: RouteLookup,
  forwardMap: Readonly<Record<string, string>>,
  parentName?: string,
): void {
  // Validate parent route exists in tree
  if (parentName) {
    let node: RouteTree | undefined = tree;

    for (const segment of parentName.split(".")) {
      node = node.children.get(segment);

      if (!node) {
        throw atAddRoute.ref`Parent route "${parentName}" does not exist`;
      }
    }
  }

  // Tracking sets for duplicate detection
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  for (const route of routes) {
    validateRoute(
      route,
      "addRoute",
      tree,
      parentName ?? "",
      seenNames,
      seenPathsByParent,
    );
  }

  validateForwardToTargets(routes, forwardMap, lookup, parentName);
}

// ============================================================================
// Instance-level validators (moved from routesCrud.ts)
// ============================================================================

/**
 * Validates that forwardTo target doesn't require params that source doesn't have.
 *
 * ⚠ The `update` door is the only one that reaches this, so the message names
 * it. The batch doors carry their own copy in `forwardTo.ts`, which also
 * resolves a target the tree does not hold YET from the batch being registered
 * — and names `addRoute`, as the batch copy of this check does.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param lookup - Path slots of routes that already exist
 */
export function validateForwardToParamCompatibility(
  sourceName: string,
  targetName: string,
  lookup: RouteLookup,
): void {
  const sourceParams = new Set(lookup.getUrlParams(sourceName));

  // Check if target requires params that source doesn't have
  const missingParams = lookup
    .getUrlParams(targetName)
    .filter((param) => !sourceParams.has(param));

  if (missingParams.length > 0) {
    throw atUpdateRoute.plain`forwardTo target "${targetName}" requires params [${missingParams.join(", ")}] that are not available in source route "${sourceName}"`;
  }
}

/**
 * Validates that adding forwardTo doesn't create a cycle.
 * Creates a test map with the new entry and uses resolveForwardChain
 * to detect cycles before any mutation happens.
 *
 * @param sourceName - Source route name
 * @param targetName - Target route name
 * @param forwardMap - The ONE-HOP forward map (never the resolved one)
 */
export function validateForwardToCycle(
  sourceName: string,
  targetName: string,
  forwardMap: Readonly<Record<string, string>>,
): void {
  // Create a test map with the new entry to validate BEFORE mutation
  const testMap = {
    ...forwardMap,
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
 * @param lookup - Existence and path slots of routes that already exist
 * @param forwardMap - The ONE-HOP forward map
 */
export function validateUpdateRoute<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  name: string,
  forwardTo: string | ForwardToCallback<Dependencies> | null | undefined,
  lookup: RouteLookup,
  forwardMap: Readonly<Record<string, string>>,
): void {
  // Validate route exists
  if (!lookup.hasRoute(name)) {
    throw atUpdateRoute.ref`route "${name}" does not exist`;
  }

  // Validate forwardTo target exists and is valid (only for string forwardTo)
  if (
    forwardTo !== undefined &&
    forwardTo !== null &&
    typeof forwardTo === "string"
  ) {
    if (!lookup.hasRoute(forwardTo)) {
      throw atUpdateRoute.plain`forwardTo target "${forwardTo}" does not exist`;
    }

    // Check forwardTo param compatibility
    validateForwardToParamCompatibility(name, forwardTo, lookup);

    // Check for cycle detection
    validateForwardToCycle(name, forwardTo, forwardMap);
  }
}
