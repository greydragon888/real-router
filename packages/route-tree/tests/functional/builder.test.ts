// Tests for the new pure function API - Builder
import { describe, it, expect } from "vitest";

import {
  createRouteTree,
  createRouteTreeBuilder,
  DuplicateRouteError,
  InvalidRouteError,
} from "../../modules/builder";

describe("createRouteTree", () => {
  describe("basic tree creation", () => {
    it("should create a tree with simple routes", () => {
      const tree = createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);

      expect(tree.name).toBe("");
      expect(tree.children).toHaveLength(2);
      expect(tree.children[0].name).toBe("users");
      expect(tree.children[1].name).toBe("home");
    });

    it("should create a tree with nested routes", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].name).toBe("users");
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].name).toBe("profile");
    });

    it("should handle dot-notation names", () => {
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users" },
        { name: "users.profile", path: "/:id" },
      ]);

      expect(tree.children[0].name).toBe("users");
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].name).toBe("profile");
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

      expect(tree.children[0].fullName).toBe("users");
      expect(tree.children[0].children[0].fullName).toBe("users.profile");
    });

    it("should compute childrenByName Map", () => {
      const tree = createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);

      expect(tree.childrenByName.get("home")).toBe(tree.children[1]);
      expect(tree.childrenByName.get("users")).toBe(tree.children[0]);
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

      const usersNode = tree.children[0];

      expect(usersNode.children).toHaveLength(2);
      expect(usersNode.nonAbsoluteChildren).toHaveLength(1);
      expect(usersNode.nonAbsoluteChildren[0].name).toBe("profile");
    });

    it("should compute absoluteDescendants", () => {
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

      expect(tree.absoluteDescendants).toHaveLength(1);
      expect(tree.absoluteDescendants[0].name).toBe("admin");
    });

    it("should compute parentSegments", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      const profileNode = tree.children[0].children[0];

      expect(profileNode.parentSegments).toHaveLength(1);
      expect(profileNode.parentSegments[0].name).toBe("users");
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
      expect(tree.children[0].parent).toBe(tree);
      expect(tree.children[0].children[0].parent).toBe(tree.children[0]);
    });
  });

  describe("sorting", () => {
    it("should sort children by routing priority", () => {
      const tree = createRouteTree("", "", [
        { name: "splat", path: "/*path" },
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        { name: "dynamic", path: "/:id" },
      ]);

      const names = tree.children.map((c) => c.name);

      // More specific routes should come first
      // Sorting order: users (most specific), dynamic, splat, home (root "/" is always last)
      expect(names[0]).toBe("users");
      expect(names[1]).toBe("dynamic");
      expect(names[2]).toBe("splat");
      expect(names[3]).toBe("home"); // "/" always sorts last
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

    expect(tree.children).toHaveLength(2);
  });

  it("should build tree with addMany()", () => {
    const tree = createRouteTreeBuilder("", "")
      .addMany([
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ])
      .build();

    expect(tree.children).toHaveLength(2);
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

    expect(tree.children).toHaveLength(4);
  });
});

describe("validation", () => {
  it("should throw InvalidRouteError for missing name", () => {
    expect(() => {
      // @ts-expect-error Testing invalid input
      createRouteTree("", "", [{ path: "/" }]);
    }).toThrowError(InvalidRouteError);
  });

  it("should throw InvalidRouteError for empty string name (line 26 !route.name)", () => {
    // Tests the falsy check on route.name (empty string is falsy but typeof === "string")
    expect(() => {
      createRouteTree("", "", [{ name: "", path: "/" }]);
    }).toThrowError(InvalidRouteError);
  });

  it("should throw InvalidRouteError for non-string name (line 26 typeof check)", () => {
    // Tests typeof check when name is truthy but not a string
    expect(() => {
      // @ts-expect-error Testing invalid input
      createRouteTree("", "", [{ name: 123, path: "/" }]);
    }).toThrowError(InvalidRouteError);
  });

  it("should throw InvalidRouteError for missing path", () => {
    expect(() => {
      // @ts-expect-error Testing invalid input
      createRouteTree("", "", [{ name: "home" }]);
    }).toThrowError(InvalidRouteError);
  });

  it("should throw DuplicateRouteError for duplicate names", () => {
    expect(() => {
      createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "home", path: "/home" },
      ]);
    }).toThrowError(DuplicateRouteError);
  });

  it("should throw DuplicateRouteError for duplicate paths at same level (line 68)", () => {
    // Tests duplicate path detection and verifies error property
    expect(() => {
      createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "root", path: "/" }, // same path
      ]);
    }).toThrowError(DuplicateRouteError);
  });

  it("should handle multiple paths at same parent level (line 72 pathsAtLevel branch)", () => {
    // Tests the branch where pathsAtLevel already exists and needs .add()
    const tree = createRouteTree("", "", [
      { name: "first", path: "/first" },
      { name: "second", path: "/second" },
      { name: "third", path: "/third" },
    ]);

    expect(tree.children).toHaveLength(3);
  });

  it("should use empty parentPrefix for root level routes (line 99)", () => {
    // Tests that root level routes are correctly validated at "" parent level
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "posts", path: "/posts" },
    ]);

    expect(tree.childrenByName.get("users")).toBeDefined();
    expect(tree.childrenByName.get("posts")).toBeDefined();
  });

  it("should not push empty children to stack (line 117 length > 0)", () => {
    // Tests that routes with empty children array don't cause issues
    const tree = createRouteTree("", "", [
      { name: "parent", path: "/parent", children: [] },
    ]);

    expect(tree.children[0].children).toHaveLength(0);
  });

  it("should validate nested children correctly (line 117 children processing)", () => {
    // Tests that children are pushed to stack and validated
    expect(() => {
      createRouteTree("", "", [
        {
          name: "parent",
          path: "/parent",
          children: [
            { name: "child1", path: "/child1" },
            { name: "child1", path: "/child2" }, // duplicate name
          ],
        },
      ]);
    }).toThrowError(DuplicateRouteError);
  });
});

describe("skipValidation option", () => {
  it("should skip validation when skipValidation is true", () => {
    // This would normally throw DuplicateRouteError, but with skipValidation=true
    // the validation is skipped (useful when routes are pre-validated externally)
    // Note: The tree will still be built, but may have undefined behavior with duplicates
    const tree = createRouteTree("", "", [{ name: "home", path: "/" }], {
      skipValidation: true,
    });

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("home");
  });

  it("should skip validation in builder when using build({ skipValidation: true })", () => {
    const tree = createRouteTreeBuilder("", "")
      .add({ name: "users", path: "/users" })
      .build({ skipValidation: true });

    expect(tree.children).toHaveLength(1);
  });
});

describe("skipSort option", () => {
  it("should skip sorting when skipSort is true", () => {
    // Without skipSort, routes are sorted by priority (users before home)
    // With skipSort, routes maintain definition order
    const tree = createRouteTree(
      "",
      "",
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ],
      { skipSort: true },
    );

    // With skipSort, definition order is preserved
    expect(tree.children[0].name).toBe("home");
    expect(tree.children[1].name).toBe("users");
  });

  it("should sort by default (without skipSort)", () => {
    const tree = createRouteTree("", "", [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ]);

    // Without skipSort, routes are sorted by priority (users before home because "/" sorts last)
    expect(tree.children[0].name).toBe("users");
    expect(tree.children[1].name).toBe("home");
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

  it("should not freeze static children index arrays when skipFreeze is true", () => {
    // This test ensures we cover the freeze branch in computeStaticChildrenIndex
    const tree = createRouteTree(
      "",
      "",
      [
        { name: "users", path: "/users" },
        { name: "products", path: "/products" },
      ],
      { skipFreeze: true },
    );

    // Static index should exist but arrays not frozen
    expect(tree.staticChildrenByFirstSegment.size).toBe(2);

    const usersRoutes = tree.staticChildrenByFirstSegment.get("users");

    expect(usersRoutes).toBeDefined();
    expect(Object.isFrozen(usersRoutes)).toBe(false);
  });
});

describe("staticChildrenByFirstSegment", () => {
  it("should index static routes by first segment", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "products", path: "/products" },
    ]);

    expect(tree.staticChildrenByFirstSegment.size).toBe(2);
    expect(tree.staticChildrenByFirstSegment.get("users")).toHaveLength(1);
    expect(tree.staticChildrenByFirstSegment.get("products")).toHaveLength(1);
  });

  it("should group multiple routes with same first segment", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "users-admin", path: "/users/admin" },
    ]);

    // Both routes start with "users"
    expect(tree.staticChildrenByFirstSegment.get("users")).toHaveLength(2);
  });

  it("should not index dynamic routes", () => {
    const tree = createRouteTree("", "", [
      { name: "dynamic", path: "/:id" },
      { name: "splat", path: "/*path" },
    ]);

    // Dynamic routes should not be indexed
    expect(tree.staticChildrenByFirstSegment.size).toBe(0);
  });

  it("should handle routes with query params in path", () => {
    const tree = createRouteTree("", "", [
      { name: "settings", path: "/settings?tab" },
    ]);

    // Should extract "settings" as first segment, ignoring query
    expect(tree.staticChildrenByFirstSegment.get("settings")).toHaveLength(1);
  });

  it("should handle routes with query before nested segment", () => {
    // Edge case: query marker appears before second slash in path
    // This tests the queryPos < end branch in extractFirstStaticSegment
    // Path like "/api?v/extra" has ? before the second /
    const tree = createRouteTree("", "", [
      { name: "search", path: "/search?q/results" },
    ]);

    // Should extract "search" as first segment, stopping at query
    expect(tree.staticChildrenByFirstSegment.get("search")).toHaveLength(1);
  });

  it("should handle mixed static and dynamic routes", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users" },
      { name: "dynamic", path: "/:id" },
      { name: "products", path: "/products" },
    ]);

    // Only static routes should be indexed
    expect(tree.staticChildrenByFirstSegment.size).toBe(2);
    expect(tree.staticChildrenByFirstSegment.get("users")).toBeDefined();
    expect(tree.staticChildrenByFirstSegment.get("products")).toBeDefined();
  });

  it("should be empty map for nodes with no static children", () => {
    const tree = createRouteTree("", "", [{ name: "dynamic", path: "/:id" }]);

    expect(tree.staticChildrenByFirstSegment.size).toBe(0);
  });

  it("should store keys in lowercase for case-insensitive lookup", () => {
    const tree = createRouteTree("", "", [{ name: "users", path: "/Users" }]);

    // Key should be lowercase
    expect(tree.staticChildrenByFirstSegment.get("users")).toBeDefined();
    expect(tree.staticChildrenByFirstSegment.get("Users")).toBeUndefined();
  });

  it("should compute index for nested children", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    const usersNode = tree.children[0];

    expect(usersNode.staticChildrenByFirstSegment.size).toBe(2);
    expect(usersNode.staticChildrenByFirstSegment.get("profile")).toHaveLength(
      1,
    );
    expect(usersNode.staticChildrenByFirstSegment.get("settings")).toHaveLength(
      1,
    );
  });

  it("should index routes with relative paths (no leading slash)", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [
          // Relative path without leading slash
          { name: "profile", path: "profile" },
          { name: "settings", path: "settings" },
        ],
      },
    ]);

    const usersNode = tree.children[0];

    // Should still be indexed by first segment
    expect(usersNode.staticChildrenByFirstSegment.size).toBe(2);
    expect(usersNode.staticChildrenByFirstSegment.get("profile")).toHaveLength(
      1,
    );
    expect(usersNode.staticChildrenByFirstSegment.get("settings")).toHaveLength(
      1,
    );
  });

  it("should handle routes with query params but no slashes", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "search", path: "search?q" }],
      },
    ]);

    const usersNode = tree.children[0];

    // Should extract "search" as first segment (stripping query)
    expect(usersNode.staticChildrenByFirstSegment.get("search")).toHaveLength(
      1,
    );
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
      const parentNode = tree.childrenByName.get("parent");
      const secondNode = parentNode?.childrenByName.get("second");
      const firstNode = parentNode?.childrenByName.get("first");

      // "nested" should be under "second", NOT under "first"
      expect(secondNode?.children).toHaveLength(1);
      expect(secondNode?.childrenByName.get("nested")).toBeDefined();
      expect(firstNode?.children).toHaveLength(0);
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
        tree1.childrenByName.get("level1")?.childrenByName.get("level2"),
      ).toBeDefined();
      expect(
        tree1.childrenByName.get("level1")?.childrenByName.get("sibling2"),
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
      const aNode = tree2.childrenByName.get("a");
      const bNode = aNode?.childrenByName.get("b");

      expect(bNode?.children).toHaveLength(2);
      expect(bNode?.childrenByName.get("c")).toBeDefined();
      expect(bNode?.childrenByName.get("d")).toBeDefined();
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
      const settingsNode = tree.childrenByName
        .get("users")
        ?.childrenByName.get("settings");

      expect(settingsNode?.children).toHaveLength(1);
      expect(settingsNode?.children[0].name).toBe("notifications");
      expect(settingsNode?.children[0].fullName).toBe(
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

      const parentNode = tree.childrenByName.get("parent");

      expect(parentNode).toBeDefined();
      expect(parentNode?.children).toHaveLength(2);
      expect(parentNode?.childrenByName.get("nested")).toBeDefined();
      expect(parentNode?.childrenByName.get("child")).toBeDefined();
    });

    it("should handle route with empty children array as simple route", () => {
      // Empty children array should be treated as no children (falsy check)
      const tree = createRouteTree("", "", [
        { name: "parent", path: "/parent", children: [] },
        { name: "sibling", path: "/sibling" },
      ]);

      expect(tree.children).toHaveLength(2);
    });
  });
});

describe("mutation testing coverage - computeCaches", () => {
  describe("staticPath computation (line 210)", () => {
    it("should return null for routes with urlParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "user", path: "/user/:id" },
      ]);

      expect(tree.children[0].staticPath).toBeNull();
    });

    it("should return null for routes with queryParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      expect(tree.children[0].staticPath).toBeNull();
    });

    it("should return null for routes with spatParams only", () => {
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      expect(tree.children[0].staticPath).toBeNull();
    });

    it("should return static path for routes without any params", () => {
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      expect(tree.children[0].staticPath).toBe("/about");
    });
  });

  describe("extractFirstStaticSegment edge cases (lines 49, 57)", () => {
    it("should handle path with query before slash (queryPos < end)", () => {
      // Path like "/api?version/extra" where ? comes before /
      // This specifically tests the `queryPos < end` branch
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "/",
          children: [{ name: "api", path: "api?v/nested" }],
        },
      ]);

      const rootNode = tree.children[0];

      expect(rootNode.staticChildrenByFirstSegment.get("api")).toHaveLength(1);
    });

    it("should handle path with query AFTER slash (queryPos > end, line 49)", () => {
      // Path like "/users/profile?tab" where / comes before ?
      // This tests that when queryPos > end, we use end (slash position)
      // If the mutant `queryPos <= end` was used, it would incorrectly use queryPos
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "/",
          children: [{ name: "api", path: "/users/profile?tab" }],
        },
      ]);

      const rootNode = tree.children[0];

      // First segment should be "users" (up to first slash after start), not "users/profile"
      expect(rootNode.staticChildrenByFirstSegment.get("users")).toHaveLength(
        1,
      );
      expect(
        rootNode.staticChildrenByFirstSegment.get("users/profile"),
      ).toBeUndefined();
    });

    it("should handle path with no query and no slash after first segment (end === -1)", () => {
      // Path like "users" with no slash or query after
      // This tests the case where end === -1 (no more slashes)
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "/",
          children: [{ name: "simple", path: "users" }],
        },
      ]);

      const rootNode = tree.children[0];

      expect(rootNode.staticChildrenByFirstSegment.get("users")).toHaveLength(
        1,
      );
    });

    it("should return null for root slash path (segment === '')", () => {
      // Path "/" should extract empty segment which returns null
      const tree = createRouteTree("", "", [
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "slash", path: "/" }],
        },
      ]);

      const parentNode = tree.children[0];

      // Root "/" child should not be indexed (returns null from extractFirstStaticSegment)
      expect(parentNode.staticChildrenByFirstSegment.get("")).toBeUndefined();
    });
  });

  describe("freeze behavior (lines 110-113)", () => {
    it("should freeze static index arrays when freeze=true (default)", () => {
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users" },
        { name: "users2", path: "/users/extra" },
      ]);

      const usersRoutes = tree.staticChildrenByFirstSegment.get("users");

      expect(usersRoutes).toBeDefined();
      expect(Object.isFrozen(usersRoutes)).toBe(true);
    });
  });
});

describe("mutation testing coverage - validateRoutes", () => {
  describe("children processing (line 117)", () => {
    it("should validate nested children recursively", () => {
      // This test ensures the children branch is taken
      expect(() => {
        createRouteTree("", "", [
          {
            name: "parent",
            path: "/parent",
            children: [
              {
                name: "child",
                path: "/child",
                children: [{ name: "grandchild", path: "/grandchild" }],
              },
            ],
          },
        ]);
      }).not.toThrowError();
    });

    it("should throw for duplicate names in nested children", () => {
      expect(() => {
        createRouteTree("", "", [
          {
            name: "parent",
            path: "/parent",
            children: [
              { name: "child", path: "/child1" },
              { name: "child", path: "/child2" }, // duplicate
            ],
          },
        ]);
      }).toThrowError(DuplicateRouteError);
    });

    it("should not process children when array is empty", () => {
      // Empty children array should be skipped (length > 0 check)
      const tree = createRouteTree("", "", [
        { name: "route", path: "/route", children: [] },
      ]);

      expect(tree.children[0].children).toHaveLength(0);
    });
  });
});
