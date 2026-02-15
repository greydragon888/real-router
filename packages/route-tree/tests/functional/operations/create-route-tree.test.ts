/**
 * Tests for createRouteTree operation.
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("New API - createRouteTree", () => {
  it("should create a route tree from definitions", () => {
    const tree = createRouteTree("", "", [
      { name: "home", path: "/home" },
      { name: "users", path: "/users" },
    ]);

    expect(tree.name).toBe("");
    expect(tree.children.size).toBe(2);
  });

  it("should create tree with nested routes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          { name: "list", path: "/list" },
          { name: "profile", path: "/:id" },
        ],
      },
    ]);

    expect([...tree.children.values()][0].name).toBe("users");
    expect([...tree.children.values()][0].children.size).toBe(2);
  });

  it("should handle nested children definitions", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    expect([...tree.children.values()][0].name).toBe("users");
    expect([...[...tree.children.values()][0].children.values()][0].name).toBe(
      "profile",
    );
  });

  it("should precompute fullName for all nodes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    expect([...tree.children.values()][0].fullName).toBe("users");
    expect(
      [...[...tree.children.values()][0].children.values()][0].fullName,
    ).toBe("users.profile");
  });

  it("should provide children Map for name-based lookup", () => {
    const tree = createRouteTree("", "", [
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
    ]);

    expect(tree.children.get("home")).toBe(
      [...tree.children.values()].find((c) => c.name === "home"),
    );
    expect(tree.children.get("about")).toBe(
      [...tree.children.values()].find((c) => c.name === "about"),
    );
  });

  it("should handle root with parser (query params)", () => {
    const tree = createRouteTree("", "?globalParam", [
      { name: "home", path: "/home" },
    ]);

    expect(tree.path).toBe("?globalParam");
    expect(tree.paramTypeMap.globalParam).toBe("query");
  });
});
