/**
 * Tests for buildPath operation.
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../modules/builder/createRouteTree";
import { buildPath } from "../../../modules/operations/build";

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
});
