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
    expect(tree.children).toHaveLength(2);
  });

  it("should throw on duplicate path at same level", () => {
    expect(() =>
      createRouteTree("", "", [
        { name: "first", path: "/same" },
        { name: "second", path: "/same" },
      ]),
    ).toThrowError(/Path "\/same" is already defined/);
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

    expect(tree.children[0].name).toBe("users");
    expect(tree.children[0].children).toHaveLength(2);
  });

  it("should handle dot-notation names", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "users.profile", path: "/:id" },
    ]);

    expect(tree.children[0].name).toBe("users");
    expect(tree.children[0].children[0].name).toBe("profile");
  });

  it("should precompute fullName for all nodes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    expect(tree.children[0].fullName).toBe("users");
    expect(tree.children[0].children[0].fullName).toBe("users.profile");
  });

  it("should precompute childrenByName Map", () => {
    const tree = createRouteTree("", "", [
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
    ]);

    expect(tree.childrenByName.get("home")).toBe(
      tree.children.find((c) => c.name === "home"),
    );
    expect(tree.childrenByName.get("about")).toBe(
      tree.children.find((c) => c.name === "about"),
    );
  });

  it("should precompute parentSegments", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    const usersNode = tree.children[0];
    const profileNode = usersNode.children[0];

    expect(profileNode.parentSegments).toHaveLength(1);
    expect(profileNode.parentSegments[0]).toBe(usersNode);
  });

  it("should handle root with parser (query params)", () => {
    const tree = createRouteTree("", "?globalParam", [
      { name: "home", path: "/home" },
    ]);

    expect(tree.parser).not.toBeNull();
    expect(tree.parser?.queryParams).toContain("globalParam");
  });
});
