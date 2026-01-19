// packages/route-node/tests/functional/errors.test.ts

import { describe, it, expect } from "vitest";

import {
  DuplicateRouteError,
  InvalidRouteError,
  ParentNotFoundError,
  RouteNodeError,
  RouteNotFoundError,
} from "../../modules/validation/errors";

describe("Error Classes", () => {
  describe("RouteNodeError", () => {
    it("should create base error with correct name", () => {
      const error = new RouteNodeError("Test error");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RouteNodeError);
      expect(error.name).toBe("RouteNodeError");
      expect(error.message).toBe("Test error");
    });

    it("should maintain proper prototype chain", () => {
      const error = new RouteNodeError("Test");

      expect(Object.getPrototypeOf(error)).toBe(RouteNodeError.prototype);
    });
  });

  describe("DuplicateRouteError", () => {
    it("should create error with duplicate name details", () => {
      const error = new DuplicateRouteError(
        "Duplicate name detected",
        "home",
        "name",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RouteNodeError);
      expect(error).toBeInstanceOf(DuplicateRouteError);
      expect(error.name).toBe("DuplicateRouteError");
      expect(error.message).toBe("Duplicate name detected");
      expect(error.duplicateValue).toBe("home");
      expect(error.duplicateType).toBe("name");
    });

    it("should create error with duplicate path details", () => {
      const error = new DuplicateRouteError(
        "Duplicate path detected",
        "/users",
        "path",
      );

      expect(error).toBeInstanceOf(DuplicateRouteError);
      expect(error.duplicateValue).toBe("/users");
      expect(error.duplicateType).toBe("path");
    });
  });

  describe("InvalidRouteError", () => {
    it("should create error with correct name", () => {
      const error = new InvalidRouteError("Invalid route definition");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RouteNodeError);
      expect(error).toBeInstanceOf(InvalidRouteError);
      expect(error.name).toBe("InvalidRouteError");
      expect(error.message).toBe("Invalid route definition");
    });

    it("should handle detailed error messages", () => {
      const error = new InvalidRouteError(
        "RouteNode.add() expects routes to have a name and a path defined.",
      );

      expect(error.message).toContain("name and a path");
    });
  });

  describe("RouteNotFoundError", () => {
    it("should create error with route name", () => {
      const error = new RouteNotFoundError(
        "[route-node][buildPath] 'users' is not defined",
        "users",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RouteNodeError);
      expect(error).toBeInstanceOf(RouteNotFoundError);
      expect(error.name).toBe("RouteNotFoundError");
      expect(error.message).toBe(
        "[route-node][buildPath] 'users' is not defined",
      );
      expect(error.routeName).toBe("users");
    });

    it("should store routeName property", () => {
      const error = new RouteNotFoundError("Route not found", "admin.users");

      expect(error.routeName).toBe("admin.users");
    });
  });

  describe("ParentNotFoundError", () => {
    it("should create error with route name", () => {
      const error = new ParentNotFoundError(
        "Parent route not found for 'users.profile'",
        "users.profile",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RouteNodeError);
      expect(error).toBeInstanceOf(ParentNotFoundError);
      expect(error.name).toBe("ParentNotFoundError");
      expect(error.message).toBe("Parent route not found for 'users.profile'");
      expect(error.routeName).toBe("users.profile");
    });

    it("should store routeName property", () => {
      const error = new ParentNotFoundError(
        "Parent not found",
        "admin.settings",
      );

      expect(error.routeName).toBe("admin.settings");
    });
  });

  describe("Error instanceof checks", () => {
    it("should allow distinguishing between error types", () => {
      const routeNodeError = new RouteNodeError("base");
      const duplicateError = new DuplicateRouteError("dup", "name", "name");
      const invalidError = new InvalidRouteError("invalid");
      const notFoundError = new RouteNotFoundError("not found", "route");
      const parentError = new ParentNotFoundError("no parent", "child");

      // All are RouteNodeErrors
      expect(routeNodeError).toBeInstanceOf(RouteNodeError);
      expect(duplicateError).toBeInstanceOf(RouteNodeError);
      expect(invalidError).toBeInstanceOf(RouteNodeError);
      expect(notFoundError).toBeInstanceOf(RouteNodeError);
      expect(parentError).toBeInstanceOf(RouteNodeError);

      // But only specific ones match their class
      expect(routeNodeError).not.toBeInstanceOf(DuplicateRouteError);
      expect(duplicateError).toBeInstanceOf(DuplicateRouteError);
      expect(invalidError).not.toBeInstanceOf(DuplicateRouteError);
    });
  });
});
