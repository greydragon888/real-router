// packages/route-node/modules/builder/validateRoutes.ts

/**
 * Route Validation.
 *
 * Validates route definitions before building the tree.
 *
 * @module builder/validateRoutes
 */

import { DuplicateRouteError, InvalidRouteError } from "../validation/errors";

import type { RouteDefinition } from "../types";

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates that a route definition has required properties.
 *
 * @param route - Route definition to validate
 * @throws {InvalidRouteError} If name or path is missing
 */
function validateRouteDefinition(route: RouteDefinition): void {
  if (!route.name || typeof route.name !== "string") {
    throw new InvalidRouteError(
      "Route definition must have a 'name' property of type string.",
    );
  }

  if (typeof route.path !== "string") {
    throw new InvalidRouteError(
      `Route "${route.name}" must have a 'path' property of type string.`,
    );
  }
}

/**
 * Checks for duplicate route name and throws if found.
 */
function checkDuplicateName(fullName: string, seenNames: Set<string>): void {
  if (seenNames.has(fullName)) {
    throw new DuplicateRouteError(
      `Duplicate route name "${fullName}" found.`,
      fullName,
      "name",
    );
  }

  seenNames.add(fullName);
}

/**
 * Checks for duplicate path at the same parent level.
 */
function checkDuplicatePath(
  path: string,
  parentPrefix: string,
  seenPathsByParent: Map<string, Set<string>>,
): void {
  const pathsAtLevel = seenPathsByParent.get(parentPrefix);

  if (pathsAtLevel?.has(path)) {
    throw new DuplicateRouteError(
      `Path "${path}" is already defined`,
      path,
      "path",
    );
  }

  if (pathsAtLevel) {
    pathsAtLevel.add(path);
  } else {
    seenPathsByParent.set(parentPrefix, new Set([path]));
  }
}

/**
 * Validates all route definitions in a single pass.
 *
 * Optimized version that flattens and validates in one traversal.
 *
 * Checks:
 * - Each route has name and path
 * - No duplicate names at the same level
 * - No duplicate paths at the same parent level (considering dot-notation)
 *
 * @param routes - Routes to validate
 * @throws {InvalidRouteError} If any route is invalid
 * @throws {DuplicateRouteError} If duplicate names or paths are found
 */
export function validateRoutes(routes: readonly RouteDefinition[]): void {
  const seenNames = new Set<string>();
  const seenPathsByParent = new Map<string, Set<string>>();

  // Use stack-based iteration instead of recursion (avoids call stack overhead)
  const stack: { routes: readonly RouteDefinition[]; parentPrefix: string }[] =
    [{ routes, parentPrefix: "" }];

  while (stack.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { routes: currentRoutes, parentPrefix } = stack.pop()!;

    for (const route of currentRoutes) {
      validateRouteDefinition(route);

      // Compute full name for nested routes
      const fullName = parentPrefix
        ? `${parentPrefix}.${route.name}`
        : route.name;

      checkDuplicateName(fullName, seenNames);
      checkDuplicatePath(route.path, parentPrefix, seenPathsByParent);

      // Push children to stack (if any)
      if (route.children && route.children.length > 0) {
        stack.push({ routes: route.children, parentPrefix: fullName });
      }
    }
  }
}
