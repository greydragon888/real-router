// Tests for the new pure function API - Builder
import { describe, it, expect } from "vitest";

import { createRouteTree, createRouteTreeBuilder } from "../../src/builder";

describe("createRouteTree", () => {
  describe("basic tree creation", () => {
    it("should create a tree with simple routes", () => {
      const tree = createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);

      expect(tree.name).toBe("");
      expect(tree.children.size).toBe(2);
      // Children are in definition order
      expect([...tree.children.values()][0].name).toBe("home");
      expect([...tree.children.values()][1].name).toBe("users");
    });

    it("should create a tree with nested routes", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      expect(tree.children.size).toBe(1);
      expect([...tree.children.values()][0].name).toBe("users");
      expect([...tree.children.values()][0].children.size).toBe(1);
      expect(
        [...[...tree.children.values()][0].children.values()][0].name,
      ).toBe("profile");
    });

    it("should handle routes with children", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      expect([...tree.children.values()][0].name).toBe("users");
      expect([...tree.children.values()][0].children.size).toBe(1);
      expect(
        [...[...tree.children.values()][0].children.values()][0].name,
      ).toBe("profile");
    });
  });

  describe("pre-computed caches", () => {
    it("should compute fullName correctly", () => {
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
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);

      // Children are in definition order
      expect(tree.children.get("home")).toBe([...tree.children.values()][0]);
      expect(tree.children.get("users")).toBe([...tree.children.values()][1]);
    });

    it("should compute nonAbsoluteChildren", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [
            { name: "profile", path: "/:id" },
            { name: "admin", path: "~/admin" },
          ],
        },
      ]);

      const usersNode = [...tree.children.values()][0];

      expect(usersNode.children.size).toBe(2);
      expect(usersNode.nonAbsoluteChildren).toHaveLength(1);
      expect(usersNode.nonAbsoluteChildren[0].name).toBe("profile");
    });

    it("should set parent reference correctly", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      expect(tree.parent).toBeNull();
      expect([...tree.children.values()][0].parent).toBe(tree);
      expect(
        [...[...tree.children.values()][0].children.values()][0].parent,
      ).toBe([...tree.children.values()][0]);
    });
  });

  describe("immutability", () => {
    it("should freeze the tree", () => {
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      expect(Object.isFrozen(tree)).toBe(true);
      expect(Object.isFrozen(tree.children)).toBe(true);
    });
  });
});

describe("createRouteTreeBuilder", () => {
  it("should build tree with add()", () => {
    const tree = createRouteTreeBuilder("", "")
      .add({ name: "home", path: "/" })
      .add({ name: "users", path: "/users" })
      .build();

    expect(tree.children.size).toBe(2);
  });

  it("should build tree with addMany()", () => {
    const tree = createRouteTreeBuilder("", "")
      .addMany([
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ])
      .build();

    expect(tree.children.size).toBe(2);
  });

  it("should chain add() and addMany()", () => {
    const tree = createRouteTreeBuilder("", "")
      .add({ name: "home", path: "/" })
      .addMany([
        { name: "users", path: "/users" },
        { name: "about", path: "/about" },
      ])
      .add({ name: "contact", path: "/contact" })
      .build();

    expect(tree.children.size).toBe(4);
  });
});

describe("skipFreeze option", () => {
  it("should not freeze tree when skipFreeze is true", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/" }], {
      skipFreeze: true,
    });

    // Tree should not be frozen
    expect(Object.isFrozen(tree)).toBe(false);
    expect(Object.isFrozen(tree.children)).toBe(false);
  });

  it("should freeze tree by default (without skipFreeze)", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

    // Tree should be frozen by default
    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree.children)).toBe(true);
  });
});

describe("mutation testing coverage - buildTree", () => {
  describe("route processing order", () => {
    it("should handle route with empty children array as simple route", () => {
      // Empty children array should be treated as no children (falsy check)
      const tree = createRouteTree("", "", [
        { name: "parent", path: "/parent", children: [] },
        { name: "sibling", path: "/sibling" },
      ]);

      expect(tree.children.size).toBe(2);
    });
  });
});

describe("mutation testing coverage - computeCaches", () => {
  describe("staticPath computation (line 210)", () => {
    it("should return null for routes with urlParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "user", path: "/user/:id" },
      ]);

      expect([...tree.children.values()][0].staticPath).toBeNull();
    });

    it("should return null for routes with queryParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      expect([...tree.children.values()][0].staticPath).toBeNull();
    });

    it("should return null for routes with spatParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      expect([...tree.children.values()][0].staticPath).toBeNull();
    });

    it("should return static path for routes without any params", () => {
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      expect([...tree.children.values()][0].staticPath).toBe("/about");
    });
  });
});
