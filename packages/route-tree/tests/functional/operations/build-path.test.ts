/**
 * Tests for buildPath operation.
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../src/builder/createRouteTree";
import { buildPath } from "../../../src/operations/build";
import { getSegmentsByName } from "../../../src/operations/query";

describe("New API - buildPath", () => {
  it("should build simple path", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    const path = buildPath(tree, "home");

    expect(path).toBe("/home");
  });

  it("should build path with parameters", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id" },
    ]);

    const path = buildPath(tree, "users", { id: "123" });

    expect(path).toBe("/users/123");
  });

  it("should build nested path", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    const path = buildPath(tree, "users.profile", { id: "123" });

    expect(path).toBe("/users/123");
  });

  it("should throw for non-existent route", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    expect(() => buildPath(tree, "nonexistent")).toThrowError();
  });

  it("should build with queryParams option", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route?flag&items" },
    ]);

    const path = buildPath(
      tree,
      "route",
      { flag: true, items: ["a", "b"] },
      { queryParams: { booleanFormat: "string", arrayFormat: "brackets" } },
    );

    expect(path).toBe("/route?flag=true&items[]=a&items[]=b");
  });

  it("should build with urlParamsEncoding option", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const path = buildPath(
      tree,
      "route",
      { param: "test$@" },
      { urlParamsEncoding: "uriComponent" },
    );

    expect(path).toBe("/route/test%24%40");
  });

  it("should build with default encoding (preserves sub-delimiters)", () => {
    const tree = createRouteTree("", "", [
      { name: "route", path: "/route/:param" },
    ]);

    const path = buildPath(
      tree,
      "route",
      { param: "test value" },
      { urlParamsEncoding: "default" },
    );

    expect(path).toBe("/route/test%20value");
  });

  it("should handle trailingSlashMode always", () => {
    const tree = createRouteTree("", "", [{ name: "route", path: "/route" }]);

    const path = buildPath(tree, "route", {}, { trailingSlashMode: "always" });

    expect(path).toBe("/route/");
  });

  it("should handle trailingSlashMode never", () => {
    const tree = createRouteTree("", "", [{ name: "route", path: "/route/" }]);

    const path = buildPath(tree, "route", {}, { trailingSlashMode: "never" });

    expect(path).toBe("/route");
  });

  describe("with pre-computed segments", () => {
    it("should build path using provided segments", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      const segments = getSegmentsByName(tree, "users.profile")!;
      const path = buildPath(
        tree,
        "users.profile",
        { id: "456" },
        {},
        segments,
      );

      expect(path).toBe("/users/456");
    });

    it("should build nested path with segments and query params", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id?tab" }],
        },
      ]);

      const segments = getSegmentsByName(tree, "users.profile")!;
      const path = buildPath(
        tree,
        "users.profile",
        { id: "789", tab: "settings" },
        {},
        segments,
      );

      expect(path).toBe("/users/789?tab=settings");
    });

    it("should build path with segments and options", () => {
      const tree = createRouteTree("", "", [
        { name: "route", path: "/route/:param" },
      ]);

      const segments = getSegmentsByName(tree, "route")!;
      const path = buildPath(
        tree,
        "route",
        { param: "test" },
        { trailingSlashMode: "always" },
        segments,
      );

      expect(path).toBe("/route/test/");
    });
  });

  describe("constraint validation", () => {
    it("should validate constraints when building path", () => {
      const tree = createRouteTree("", "", [
        { name: "user", path: String.raw`/user/:id<\d+>` },
      ]);

      const path = buildPath(tree, "user", { id: "123" });

      expect(path).toBe("/user/123");
    });

    it("should throw when constraint validation fails", () => {
      const tree = createRouteTree("", "", [
        { name: "user", path: String.raw`/user/:id<\d+>` },
      ]);

      expect(() => buildPath(tree, "user", { id: "abc" })).toThrowError();
    });
  });

  describe("parameter type handling", () => {
    it("should handle object parameters by stringifying", () => {
      const tree = createRouteTree("", "", [
        { name: "route", path: "/route/:data" },
      ]);

      const path = buildPath(tree, "route", { data: { key: "value" } });

      expect(path).toBe("/route/%7B%22key%22:%22value%22%7D");
    });

    it("should handle null and undefined parameters", () => {
      const tree = createRouteTree("", "", [
        { name: "route", path: "/route/:id?/:name?" },
      ]);

      const path = buildPath(tree, "route", { id: null, name: undefined });

      expect(path).toBe("/route/:id");
    });
  });
});
