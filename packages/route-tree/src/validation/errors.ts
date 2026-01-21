// packages/route-node/modules/validation/errors.ts

/**
 * Custom error types for route-node package.
 *
 * Provides structured error handling with specific error types
 * for different failure scenarios.
 *
 * @module errors
 */

/**
 * Base error class for all route-node errors.
 *
 * All route-node specific errors inherit from this class,
 * allowing for unified error handling.
 *
 * @example
 * ```typescript
 * try {
 *   node.add(invalidRoute);
 * } catch (error) {
 *   if (error instanceof RouteNodeError) {
 *     console.error("Route configuration error:", error.message);
 *   }
 * }
 * ```
 */
export class RouteNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteNodeError";
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when attempting to add a route with a duplicate name or path.
 *
 * @example
 * ```typescript
 * // Throws DuplicateRouteError: Alias "home" is already defined in route node
 * node.add({ name: "home", path: "/" });
 * node.add({ name: "home", path: "/home" }); // Duplicate name!
 * ```
 */
export class DuplicateRouteError extends RouteNodeError {
  /** The duplicate name or path that caused the error */
  public readonly duplicateValue: string;
  /** Whether the duplicate is a name ("name") or path ("path") */
  public readonly duplicateType: "name" | "path";

  constructor(
    message: string,
    duplicateValue: string,
    duplicateType: "name" | "path",
  ) {
    super(message);
    this.name = "DuplicateRouteError";
    this.duplicateValue = duplicateValue;
    this.duplicateType = duplicateType;
  }
}

/**
 * Error thrown when a route definition is invalid.
 *
 * Common causes:
 * - Missing required name or path property
 * - Invalid route type (not an object or RouteNode)
 * - Absolute path with parameterized parents
 *
 * @example
 * ```typescript
 * // Throws InvalidRouteError: RouteNode.add() expects routes to have a name and a path defined.
 * node.add({ name: "incomplete" }); // Missing path!
 * ```
 */
export class InvalidRouteError extends RouteNodeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRouteError";
  }
}

/**
 * Error thrown when a referenced route cannot be found.
 *
 * @example
 * ```typescript
 * // Throws RouteNotFoundError: [route-node][buildPath] 'nonexistent' is not defined
 * node.buildPath("nonexistent", {});
 * ```
 */
export class RouteNotFoundError extends RouteNodeError {
  /** The route name that was not found */
  public readonly routeName: string;

  constructor(message: string, routeName: string) {
    super(message);
    this.name = "RouteNotFoundError";
    this.routeName = routeName;
  }
}

/**
 * Error thrown when a parent route cannot be found for nested route addition.
 *
 * @example
 * ```typescript
 * // Throws ParentNotFoundError when parent "users" doesn't exist
 * node.add({ name: "users.profile", path: "/profile" });
 * ```
 */
export class ParentNotFoundError extends RouteNodeError {
  /** The route name whose parent was not found */
  public readonly routeName: string;

  constructor(message: string, routeName: string) {
    super(message);
    this.name = "ParentNotFoundError";
    this.routeName = routeName;
  }
}
