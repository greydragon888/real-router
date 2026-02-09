// packages/route-node/modules/validation/route-batch.ts

/**
 * Batch route validation utilities.
 *
 * Provides validation for adding routes with cross-batch duplicate detection.
 * Used by router.addRoute() to ensure atomicity - all routes validated before any modification.
 */

import { validateRoutePath } from "./routes";

import type { RouteDefinition, RouteTree } from "../types";

/**
 * Pattern for complete route validation (all segments at once).
 * Matches: single segment or multiple segments separated by dots.
 * Each segment must start with letter/underscore, followed by alphanumeric/hyphen/underscore.
 * Rejects: leading/trailing/consecutive dots, segments starting with numbers/hyphens.
 */
const FULL_ROUTE_PATTERN = /^[A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*$/;

/**
 * Checks if string contains at least one non-whitespace character.
 */
const HAS_NON_WHITESPACE = /\S/;

/**
 * Maximum route name length to prevent DoS and performance issues.
 */
const MAX_ROUTE_NAME_LENGTH = 10_000;

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
    // Return constructor name for class instances
    if ("constructor" in value && value.constructor.name !== "Object") {
      return value.constructor.name;
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
  for (const key of Object.keys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);

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
 * @param route - Route to validate
 * @param methodName - Calling method for error context
 * @throws {TypeError} If route is not a plain object
 */
function validateRouteType(
  route: unknown,
  methodName: string,
): asserts route is Record<string, unknown> {
  if (!route || typeof route !== "object") {
    throw new TypeError(
      `[router.${methodName}] Route must be an object, got ${getTypeDescription(route)}`,
    );
  }

  // Check for plain object (prototype must be Object.prototype or null)
  const proto: object | null = Object.getPrototypeOf(route) as object | null;

  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      `[router.${methodName}] Route must be a plain object, got ${getTypeDescription(route)}`,
    );
  }

  // Check for getters/setters (could cause mutations during processing)
  if (hasGettersOrSetters(route as Record<string, unknown>)) {
    throw new TypeError(
      `[router.${methodName}] Route must not have getters or setters`,
    );
  }
}

/**
 * Validates that encodeParams is a function if provided.
 *
 * @param route - Route configuration
 * @param methodName - Calling method for error context
 * @throws {TypeError} If encodeParams is not a function
 */
function validateEncodeParams(
  route: Record<string, unknown>,
  methodName: string,
): void {
  if (
    route.encodeParams !== undefined &&
    typeof route.encodeParams !== "function"
  ) {
    throw new TypeError(
      `[router.${methodName}] Route "${String(route.name)}" encodeParams must be a function`,
    );
  }
}

/**
 * Validates that decodeParams is a function if provided.
 *
 * @param route - Route configuration
 * @param methodName - Calling method for error context
 * @throws {TypeError} If decodeParams is not a function
 */
function validateDecodeParams(
  route: Record<string, unknown>,
  methodName: string,
): void {
  if (
    route.decodeParams !== undefined &&
    typeof route.decodeParams !== "function"
  ) {
    throw new TypeError(
      `[router.${methodName}] Route "${String(route.name)}" decodeParams must be a function`,
    );
  }
}

/**
 * Validates that route name is a valid string matching the expected format.
 *
 * Route name rules:
 * - Must be a string
 * - Cannot be empty or whitespace-only
 * - Each segment must match [a-zA-Z_][a-zA-Z0-9_-]*
 * - Segments are separated by dots (e.g., "users.profile")
 * - No consecutive dots, no leading/trailing dots
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
    throw new TypeError(
      `[router.${methodName}] Route name must be a string, got ${getTypeDescription(route.name)}`,
    );
  }

  const name = route.name;

  // Empty string is not allowed for addRoute (unlike root node in type-guards)
  if (name === "") {
    throw new TypeError(`[router.${methodName}] Route name cannot be empty`);
  }

  // Whitespace-only strings are invalid
  if (!HAS_NON_WHITESPACE.test(name)) {
    throw new TypeError(
      `[router.${methodName}] Route name cannot contain only whitespace`,
    );
  }

  // Length check for technical safety
  if (name.length > MAX_ROUTE_NAME_LENGTH) {
    throw new TypeError(
      `[router.${methodName}] Route name exceeds maximum length of ${MAX_ROUTE_NAME_LENGTH} characters`,
    );
  }

  // System routes bypass pattern validation (e.g., @@router/UNKNOWN_ROUTE)
  if (name.startsWith("@@")) {
    return;
  }

  // Validate route pattern (ASCII only: letters, numbers, underscores, hyphens, dots)
  if (!FULL_ROUTE_PATTERN.test(name)) {
    throw new TypeError(
      `[router.${methodName}] Invalid route name "${name}". ` +
        `Each segment must start with a letter or underscore, ` +
        `followed by letters, numbers, underscores, or hyphens. ` +
        `Segments are separated by dots (e.g., "users.profile").`,
    );
  }
}

/**
 * Resolves a dot-notation route name to a node in the tree.
 *
 * @param rootNode - Root node to start from
 * @param dotName - Dot-separated route name (e.g., "users.profile")
 * @returns The resolved node, or undefined if not found
 */
function resolveByDotNotation(
  rootNode: RouteTree,
  dotName: string,
): RouteTree | undefined {
  // Fast path: single-segment names don't need splitting
  if (!dotName.includes(".")) {
    return rootNode.children.get(dotName);
  }

  let current: RouteTree | undefined = rootNode;

  for (const segment of dotName.split(".")) {
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
  if (resolveByDotNotation(rootNode, fullName)) {
    throw new Error(
      `[router.${methodName}] Route "${fullName}" already exists`,
    );
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
    throw new Error(
      `[router.${methodName}] Duplicate route "${fullName}" in batch`,
    );
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
): void {
  const parentNode =
    parentName === "" ? rootNode : resolveByDotNotation(rootNode, parentName);

  if (!parentNode) {
    return; // Parent doesn't exist, so no duplicate
  }

  for (const child of parentNode.children.values()) {
    if (child.path === routePath) {
      throw new Error(`Path "${routePath}" is already defined`);
    }
  }
}

/**
 * Checks that parent route exists for dot-notation names.
 *
 * For routes like "users.profile", verifies that "users" exists either:
 * - In the existing tree
 * - In the current batch (already added before this route)
 *
 * @param rootNode - Root node to search in
 * @param routeName - Route name (possibly with dots)
 * @param methodName - Calling method for error context
 * @param seenNames - Set of names already seen in batch
 * @throws {Error} If parent route does not exist
 */
function checkParentExists(
  rootNode: RouteTree | undefined,
  routeName: string,
  methodName: string,
  seenNames?: Set<string>,
): void {
  const parts = routeName.split(".");

  parts.pop(); // Remove last segment (actual route name)

  const parentName = parts.join(".");

  // Check if parent exists in current batch
  if (seenNames?.has(parentName)) {
    return; // Parent was added earlier in this batch
  }

  // Check if parent exists in tree
  if (rootNode) {
    if (!resolveByDotNotation(rootNode, parentName)) {
      throw new Error(
        `[router.${methodName}] Parent route "${parentName}" does not exist for route "${routeName}"`,
      );
    }

    return; // Parent exists in tree
  }

  // No tree and not in batch - parent doesn't exist
  throw new Error(
    `[router.${methodName}] Parent route "${parentName}" does not exist for route "${routeName}"`,
  );
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
): void {
  const pathsAtLevel = seenPathsByParent.get(parentName);

  if (pathsAtLevel?.has(routePath)) {
    throw new Error(`Path "${routePath}" is already defined`);
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

  const r = route;

  // Validate that name is a non-empty string
  validateRouteName(r, methodName);

  // Validate path structure
  validateRoutePath(r.path, r.name, methodName, rootNode);

  // Validate optional function properties
  validateEncodeParams(r, methodName);
  validateDecodeParams(r, methodName);

  const routeName = r.name;
  const fullName = parentName ? `${parentName}.${routeName}` : routeName;

  // Check that parent exists for dot-notation names (e.g., "users.profile" requires "users")
  // Only check for flat routes (no parentName) with dot-notation
  if (!parentName && fullName.includes(".")) {
    checkParentExists(rootNode, fullName, methodName, seenNames);
  }

  // Check for duplicate name in existing tree
  if (rootNode && fullName) {
    checkTreeNameDuplicate(rootNode, fullName, methodName);
  }

  // Check for duplicate name in current batch
  if (seenNames) {
    checkBatchNameDuplicate(seenNames, fullName, methodName);
  }

  const routePath = r.path;

  // For flat routes with dot-notation names (e.g., "users.settings"),
  // extract the parent from the name for path checking.
  // RouteNode will place such routes under their implied parent.
  let pathCheckParent = parentName;

  if (routeName.includes(".") && !parentName) {
    const parts = routeName.split(".");

    parts.pop(); // Remove last segment (actual route name)

    pathCheckParent = parts.join(".");
  }

  // Check for duplicate path in existing tree
  if (rootNode) {
    checkTreePathDuplicate(rootNode, pathCheckParent, routePath);
  }

  // Check for duplicate path in current batch
  if (seenPathsByParent) {
    checkBatchPathDuplicate(seenPathsByParent, pathCheckParent, routePath);
  }

  // Validate children recursively
  if (r.children !== undefined) {
    if (!Array.isArray(r.children)) {
      throw new TypeError(
        `[router.${methodName}] Route "${routeName}" children must be an array, got ${getTypeDescription(r.children)}`,
      );
    }

    for (const child of r.children) {
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
