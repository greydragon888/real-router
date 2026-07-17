// Tests for the new pure function API - Builder
import { describe, it, expect } from "vitest";

import { createRouteTree } from "engine";

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

    // #747: the "immutable" tree leaked a mutable paramMeta — node was frozen
    // but paramMeta and its arrays were not, so a push() on a tree reachable
    // from the public API succeeded.
    it("should freeze nested paramMeta and its arrays", () => {
      const tree = createRouteTree("", "", [{ name: "u", path: "/u/:id?q" }]);
      const node = tree.children.get("u")!;

      expect(Object.isFrozen(node.paramMeta)).toBe(true);
      expect(Object.isFrozen(node.paramMeta.urlParams)).toBe(true);
      expect(Object.isFrozen(node.paramMeta.queryParams)).toBe(true);
      expect(Object.isFrozen(node.paramMeta.spatParams)).toBe(true);

      expect(() => {
        (node.paramMeta.urlParams as string[]).push("HACKED");
      }).toThrow(TypeError);
      expect(node.paramMeta.urlParams).not.toContain("HACKED");
    });

    // A leaf node (no children) gets its empty children map / nonAbsoluteChildren
    // from the shared *frozen* sentinels — not a fresh per-node allocation. If the
    // leaf fast-path were skipped (children built via the general path), those
    // collections would be freshly allocated and left unfrozen, leaking a mutable
    // surface on a supposedly-immutable tree. Assert the leaf collections are frozen.
    it("should freeze a leaf node's empty children map and nonAbsoluteChildren", () => {
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);
      const leaf = tree.children.get("home")!;

      expect(leaf.children.size).toBe(0);
      expect(leaf.nonAbsoluteChildren).toHaveLength(0);
      expect(Object.isFrozen(leaf.children)).toBe(true);
      expect(Object.isFrozen(leaf.nonAbsoluteChildren)).toBe(true);
    });
  });
});
