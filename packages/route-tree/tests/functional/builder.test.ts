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

    it("should handle dot-notation names", () => {
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users" },
        { name: "users.profile", path: "/:id" },
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
  describe("dot-notation name resolution (resolveParent)", () => {
    it("should select correct sibling when using dot-notation (line 121 c.name === partName)", () => {
      // This test MUST fail if `c.name === partName` is changed to `true`
      // Key: parent has MULTIPLE children, and we need to pick the RIGHT one
      const tree = createRouteTree("", "", [
        {
          name: "parent",
          path: "/parent",
          children: [
            { name: "first", path: "/first" }, // index 0
            { name: "second", path: "/second" }, // index 1 - THIS is the target
            { name: "third", path: "/third" }, // index 2
          ],
        },
        // Dot-notation route targeting "second" specifically
        { name: "parent.second.nested", path: "/nested" },
      ]);

      // If mutant `true` was used, it would find "first" (index 0) instead of "second"
      const parentNode = tree.children.get("parent");
      const secondNode = parentNode?.children.get("second");
      const firstNode = parentNode?.children.get("first");

      // "nested" should be under "second", NOT under "first"
      expect(secondNode?.children.size).toBe(1);
      expect(secondNode?.children.get("nested")).toBeDefined();
      expect(firstNode?.children.size).toBe(0);
    });

    it("should correctly resolve 3-level deep dot-notation names", () => {
      // First tree: verify nested structure with siblings at each level
      const tree1 = createRouteTree("", "", [
        {
          name: "level1",
          path: "/level1",
          children: [
            {
              name: "level2",
              path: "/level2",
              children: [{ name: "level3", path: "/level3" }],
            },
            // Add a sibling to ensure correct child is selected
            {
              name: "sibling2",
              path: "/sibling2",
            },
          ],
        },
        // Add a sibling at root level too
        { name: "sibling1", path: "/sibling1" },
      ]);

      // Verify tree1 has correct structure (without dot-notation)
      expect(
        tree1.children.get("level1")?.children.get("level2"),
      ).toBeDefined();
      expect(
        tree1.children.get("level1")?.children.get("sibling2"),
      ).toBeDefined();

      // Second tree: test deep dot-notation resolution
      const tree2 = createRouteTree("", "", [
        {
          name: "a",
          path: "/a",
          children: [
            {
              name: "b",
              path: "/b",
              children: [{ name: "c", path: "/c" }],
            },
          ],
        },
        { name: "a.b.d", path: "/d" }, // Uses dot-notation to add under a.b
      ]);

      // Verify the dot-notation route was added to the correct parent
      const aNode = tree2.children.get("a");
      const bNode = aNode?.children.get("b");

      expect(bNode?.children.size).toBe(2);
      expect(bNode?.children.get("c")).toBeDefined();
      expect(bNode?.children.get("d")).toBeDefined();
    });

    it("should get correct final name from parts.at(-1) (line 125)", () => {
      // This test kills the mutant that changes `parts.at(-1)` to `parts.at(+1)`
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "settings", path: "/settings" }],
        },
        { name: "users.settings.notifications", path: "/notifications" },
      ]);

      // The route should be named "notifications" (last part), not "settings" (second part)
      const settingsNode = tree.children.get("users")?.children.get("settings");

      expect(settingsNode?.children.size).toBe(1);
      expect([...(settingsNode?.children.values() ?? [])][0].name).toBe(
        "notifications",
      );
      expect([...(settingsNode?.children.values() ?? [])][0].fullName).toBe(
        "users.settings.notifications",
      );
    });
  });

  describe("route processing order (lines 153-156)", () => {
    it("should process routes with nested children before dot-notation routes", () => {
      // Tests that routes with children are added first, then dot-notation routes
      const tree = createRouteTree("", "", [
        { name: "parent.child", path: "/child" }, // dot-notation - processed second
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "nested", path: "/nested" }],
        }, // has children - processed first
      ]);

      const parentNode = tree.children.get("parent");

      expect(parentNode).toBeDefined();
      expect(parentNode?.children.size).toBe(2);
      expect(parentNode?.children.get("nested")).toBeDefined();
      expect(parentNode?.children.get("child")).toBeDefined();
    });

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
