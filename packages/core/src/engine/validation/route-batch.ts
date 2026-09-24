/**
 * Batch route validation utilities.
 *
 * Provides validation for adding routes with cross-batch duplicate detection.
 * Used by router.addRoute() to ensure atomicity - all routes validated before any modification.
 */

import {
  assertNoDottedRouteName,
  assertRouteNameMatchesPattern,
  assertRouteNameNotEmpty,
  assertRouteNameNotWhitespaceOnly,
  assertRouteNameWithinLength,
} from "./route-name";
import { validateRoutePath } from "./routes";
import { raiser } from "../../RouterError";

import type { RouteDefinition, RouteTree } from "../types";

/**
 * Intrinsics captured at module load: `getOwnPropertyDescriptor`, `objectKeys`, `getPrototypeOf`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ The limit of what capture buys — and the shim order that defeats it — is
 * stated once, in `guards.ts`. Not restated here (#2091).
 */
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectKeys = Object.keys;
const getPrototypeOf = Object.getPrototypeOf;

/**
 * Gets a human-readable description of a value's type.
 * Used for error messages to provide helpful debugging information.
 */
function getTypeDescription(value: unknown): string {
  // Handle null explicitly (typeof null === "object")
  if (value === null) {
    return "null";
  }

  if (typeof value === "object") {
    // Read `constructor`/`.name` defensively: an adversarial own `constructor`
    // (null, a string, a number, …) is not a real constructor and must not crash
    // here nor yield a non-string (#903); a THROWING accessor — a `constructor`
    // getter, a function constructor with a throwing `.name` getter, or a Proxy
    // that throws on [[Get]] — must not crash either (#1052). Both fall back to
    // "object". (Byte-identical twin of type-guards' getTypeDescription —
    // route-tree has no type-guards dependency, so the hardening is duplicated.)
    try {
      const ctor: unknown = (value as { constructor?: unknown }).constructor;

      // Return constructor name for class instances
      if (typeof ctor === "function" && ctor.name !== "Object") {
        return ctor.name || "object"; // empty name (anonymous class) → "object"
      }
    } catch {
      // Throwing constructor/.name getter or Proxy [[Get]] → fall through (#1052).
    }

    // Plain object
    return "object";
  }

  // Primitive types (string, number, boolean, undefined, etc.)
  return typeof value;
}

/**
 * Checks if an object has getters or setters.
 * Used to detect potentially malicious route objects that could mutate during processing.
 *
 * @param obj - Object to check
 * @returns true if object has getters or setters
 */
function hasGettersOrSetters(obj: Record<string, unknown>): boolean {
  for (const key of objectKeys(obj)) {
    const descriptor = getOwnPropertyDescriptor(obj, key);

    if (descriptor && (descriptor.get || descriptor.set)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that route is a plain object without getters/setters.
 * Prevents malicious objects that could mutate during processing.
 *
 * ⚑ Every question here is about the OBJECT — its type, its prototype, its
 * descriptors — never about a value it carries, and that is what decides WHERE
 * it may run (#1911). A snapshot answers all three the same way whatever the
 * caller handed over, because a spread produces a plain, accessor-free object.
 * So this has to see the CALLER's value, which is why `guardRouteStructure`
 * calls it above `snapshotRouteBatch` on every registration door.
 *
 * @param route - Route to validate
 * @param methodName - Calling method for error context
 * @throws {TypeError} If route is not a plain object
 */
export function validateRouteType(
  route: unknown,
  methodName: string,
): asserts route is Record<string, unknown> {
  if (!route || typeof route !== "object") {
    const at = raiser("router", methodName);

    throw at.type`Route must be an object, got ${getTypeDescription(route)}`;
  }

  // Check for plain object (prototype must be Object.prototype or null)
  const proto: object | null = getPrototypeOf(route) as object | null;

  if (proto !== Object.prototype && proto !== null) {
    const at = raiser("router", methodName);

    throw at.type`Route must be a plain object, got ${getTypeDescription(route)}`;
  }

  // Check for getters/setters (could cause mutations during processing)
  if (hasGettersOrSetters(route as Record<string, unknown>)) {
    const at = raiser("router", methodName);

    throw at.type`Route must not have getters or setters`;
  }
}

/**
 * Refuses a route codec — `encodeParams` / `decodeParams` — that is not a
 * function.
 *
 * Both layers call it, and each decides which values count as absent:
 * {@link validateRoute} passes every value but `undefined`, bare-core
 * registration (`namespaces/RoutesNamespace/routesStore.ts`) only a truthy one,
 * because core drops a falsy structural field (#1797). The message has one
 * owner, as in `./route-name` (#2035).
 */
export function assertRouteCodecIsFunction(
  field: "decodeParams" | "encodeParams",
  codec: unknown,
  routeName: string,
  methodName: string | undefined,
): void {
  if (typeof codec !== "function") {
    const at = raiser("router", methodName);

    throw at.type`Route "${routeName}" ${field} must be a function`;
  }
}

/** {@link assertRouteCodecIsFunction} on a codec the definition provides. */
function validateCodec(
  field: "decodeParams" | "encodeParams",
  codec: unknown,
  fullName: string,
  methodName: string,
): void {
  if (codec !== undefined) {
    assertRouteCodecIsFunction(field, codec, fullName, methodName);
  }
}

/**
 * Validates that route name is a valid string matching the expected format.
 *
 * Route name rules:
 * - Must be a string
 * - Cannot be empty or whitespace-only
 * - Cannot contain dots (use children array or { parent } option instead)
 * - Must match [a-zA-Z_][a-zA-Z0-9_-]*
 *
 * ⚠ The string check stays inline rather than joining `./route-name`: core
 * carries two wordings for it — this one reports `getTypeDescription`, and
 * `assertNoInternalRouteName` reports bare `typeof` to mirror the plugin — so
 * sharing one predicate would change a message rather than move it.
 *
 * @param route - Route configuration
 * @param methodName - Calling method for error context
 * @throws {TypeError} If name is missing, not a string, or invalid format
 */
function validateRouteName(
  route: Record<string, unknown>,
  methodName: string,
): asserts route is Record<string, unknown> & { name: string } {
  if (typeof route.name !== "string") {
    const at = raiser("router", methodName);

    throw at.type`Route name must be a string, got ${getTypeDescription(route.name)}`;
  }

  const name = route.name;

  assertRouteNameNotEmpty(name, methodName);
  assertRouteNameNotWhitespaceOnly(name, methodName);
  assertRouteNameWithinLength(name, methodName);

  // System routes bypass the spelling rules (e.g., @@router/UNKNOWN_ROUTE).
  if (name.startsWith("@@")) {
    return;
  }

  assertNoDottedRouteName(name, methodName);
  assertRouteNameMatchesPattern(name, methodName);
}

/**
 * Finds a node by its fullName in the tree.
 * Even though user-provided route names cannot contain dots,
 * fullName is computed during validation (e.g., "parent.child").
 *
 * @param rootNode - Root node to start from
 * @param fullName - Full route name (e.g., "users.profile")
 * @returns The resolved node, or undefined if not found
 */
function findNodeByFullName(
  rootNode: RouteTree,
  fullName: string,
): RouteTree | undefined {
  // Fast path: single-segment names don't need splitting
  // Stryker disable next-line ConditionalExpression,StringLiteral,BlockStatement: equivalent — the fast path is a pure optimization; for a dotless name the general path below yields the identical result (`name.split(".")` → `[name]`, a one-iteration `children.get(name)`). (BooleanLiteral stays live: dropping the `!` runs the fast path for a dotted name → `children.get("a.b")` is undefined = killed.)
  if (!fullName.includes(".")) {
    return rootNode.children.get(fullName);
  }

  let current: RouteTree | undefined = rootNode;

  for (const segment of fullName.split(".")) {
    current = current.children.get(segment);

    if (!current) {
      return undefined;
    }
  }

  return current;
}

/**
 * Checks for duplicate route name in existing tree.
 *
 * @param rootNode - Root node to search in
 * @param fullName - Full route name (dot-notation)
 * @param methodName - Calling method for error context
 * @throws {Error} If route name already exists
 */
function checkTreeNameDuplicate(
  rootNode: RouteTree,
  fullName: string,
  methodName: string,
): void {
  if (findNodeByFullName(rootNode, fullName)) {
    const at = raiser("router", methodName);

    throw at.plain`Route "${fullName}" already exists`;
  }
}

/**
 * Checks for duplicate route name in current batch.
 *
 * @param seenNames - Set of names already seen in batch
 * @param fullName - Full route name to check
 * @param methodName - Calling method for error context
 * @throws {Error} If duplicate name in batch
 */
function checkBatchNameDuplicate(
  seenNames: Set<string>,
  fullName: string,
  methodName: string,
): void {
  if (seenNames.has(fullName)) {
    const at = raiser("router", methodName);

    throw at.plain`Duplicate route "${fullName}" in batch`;
  }

  seenNames.add(fullName);
}

/**
 * Checks for duplicate path in existing tree at same parent level.
 *
 * @param rootNode - Root node to search in
 * @param parentName - Parent route name (empty string for root level)
 * @param routePath - Path to check for duplicates
 * @throws {Error} If path already exists at this level
 */
function checkTreePathDuplicate(
  rootNode: RouteTree,
  parentName: string,
  routePath: string,
  methodName: string,
): void {
  const parentNode =
    parentName === "" ? rootNode : findNodeByFullName(rootNode, parentName);

  if (!parentNode) {
    return; // Parent doesn't exist, so no duplicate
  }

  for (const child of parentNode.children.values()) {
    if (child.path === routePath) {
      const at = raiser("router", methodName);

      throw at.plain`Path "${routePath}" is already defined`;
    }
  }
}

/**
 * Checks for duplicate path in current batch at same parent level.
 *
 * @param seenPathsByParent - Map of paths by parent name
 * @param parentName - Parent route name (empty string for root level)
 * @param routePath - Path to check for duplicates
 * @throws {Error} If path already exists at this level in batch
 */
function checkBatchPathDuplicate(
  seenPathsByParent: Map<string, Set<string>>,
  parentName: string,
  routePath: string,
  methodName: string,
): void {
  const pathsAtLevel = seenPathsByParent.get(parentName);

  if (pathsAtLevel?.has(routePath)) {
    const at = raiser("router", methodName);

    throw at.plain`Path "${routePath}" is already defined`;
  }

  if (pathsAtLevel) {
    pathsAtLevel.add(routePath);
  } else {
    seenPathsByParent.set(parentName, new Set([routePath]));
  }
}

/**
 * Validates route structure for add operations.
 *
 * Performs comprehensive validation including:
 * - Type check (must be object)
 * - Name validation
 * - Path validation
 * - Duplicate name detection (in tree and batch)
 * - Duplicate path detection (in tree and batch)
 * - Recursive children validation
 *
 * @param route - Route to validate
 * @param methodName - Calling method for error context
 * @param rootNode - Optional root node for duplicate checking
 * @param parentName - Parent route name for building full path (used in recursion)
 * @param seenNames - Set of names already seen in this batch
 * @param seenPathsByParent - Map of paths by parent for path duplicate detection
 * @throws {TypeError} If route structure is invalid
 * @throws {Error} If route already exists (duplicate)
 * @throws {Error} If path already defined (duplicate)
 *
 * @example
 * ```typescript
 * const seenNames = new Set<string>();
 * const seenPaths = new Map<string, Set<string>>();
 *
 * // Validate routes before adding
 * for (const route of routes) {
 *   validateRoute(route, "add", rootNode, "", seenNames, seenPaths);
 * }
 * ```
 */
export function validateRoute(
  route: unknown,
  methodName: string,
  rootNode?: RouteTree,
  parentName = "",
  seenNames?: Set<string>,
  seenPathsByParent?: Map<string, Set<string>>,
): asserts route is RouteDefinition {
  validateRouteType(route, methodName);

  const routeDef = route;

  // Validate that name is a non-empty string
  validateRouteName(routeDef, methodName);

  // Validate path structure
  validateRoutePath(routeDef.path, routeDef.name, methodName, rootNode);

  const routeName = routeDef.name;
  const fullName = parentName ? `${parentName}.${routeName}` : routeName;

  // Validate optional function properties, naming the route in full as core does
  validateCodec("encodeParams", routeDef.encodeParams, fullName, methodName);
  validateCodec("decodeParams", routeDef.decodeParams, fullName, methodName);

  // Check for duplicate name in existing tree
  if (rootNode && fullName) {
    checkTreeNameDuplicate(rootNode, fullName, methodName);
  }

  // Check for duplicate name in current batch
  if (seenNames) {
    checkBatchNameDuplicate(seenNames, fullName, methodName);
  }

  const routePath = routeDef.path;
  const pathCheckParent = parentName;

  // Check for duplicate path in existing tree
  if (rootNode) {
    checkTreePathDuplicate(rootNode, pathCheckParent, routePath, methodName);
  }

  // Check for duplicate path in current batch
  if (seenPathsByParent) {
    checkBatchPathDuplicate(
      seenPathsByParent,
      pathCheckParent,
      routePath,
      methodName,
    );
  }

  // Validate children recursively
  if (routeDef.children !== undefined) {
    if (!Array.isArray(routeDef.children)) {
      const at = raiser("router", methodName);

      throw at.type`Route "${routeName}" children must be an array, got ${getTypeDescription(routeDef.children)}`;
    }

    for (const child of routeDef.children) {
      validateRoute(
        child,
        methodName,
        rootNode,
        fullName,
        seenNames,
        seenPathsByParent,
      );
    }
  }
}
