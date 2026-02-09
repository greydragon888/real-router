// packages/route-node/tests/functional/validation-route-batch.test.ts

import { describe, it, expect } from "vitest";

import { validateRoute } from "route-tree";

// eslint-disable-next-line vitest/no-mocks-import -- intentional: using mock factory, not vi.mock
import { createMockRouteNode } from "../__mocks__/route-tree-mock";

describe("validateRoute", () => {
  const methodName = "add";

  describe("type validation", () => {
    it("should throw TypeError for null", () => {
      expect(() => {
        validateRoute(null, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(null, methodName);
      }).toThrowError("[router.add] Route must be an object, got null");
    });

    it("should throw TypeError for undefined", () => {
      expect(() => {
        validateRoute(undefined, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(undefined, methodName);
      }).toThrowError("[router.add] Route must be an object, got undefined");
    });

    it("should throw TypeError for primitives", () => {
      expect(() => {
        validateRoute("string", methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(123, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(true, methodName);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for class instances", () => {
      class RouteClass {
        name = "class-route";
        path = "/class";
      }

      expect(() => {
        validateRoute(new RouteClass(), methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(new RouteClass(), methodName);
      }).toThrowError(/must be a plain object/);
    });

    it("should throw TypeError for route with getter", () => {
      const routeWithGetter = {
        get name(): string {
          return "getter-route";
        },
        path: "/getter",
      };

      expect(() => {
        validateRoute(routeWithGetter, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(routeWithGetter, methodName);
      }).toThrowError(/must not have getters or setters/);
    });

    it("should throw TypeError for route with setter", () => {
      let _name = "setter-route";
      const routeWithSetter = {
        get name(): string {
          return _name;
        },
        set name(value: string) {
          _name = value;
        },
        path: "/setter",
      };

      expect(() => {
        validateRoute(routeWithSetter, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute(routeWithSetter, methodName);
      }).toThrowError(/must not have getters or setters/);
    });

    it("should allow Object.create(null) route", () => {
      const nullProtoRoute = Object.create(null) as {
        name: string;
        path: string;
      };

      nullProtoRoute.name = "null-proto";
      nullProtoRoute.path = "/null-proto";

      expect(() => {
        validateRoute(nullProtoRoute, methodName);
      }).not.toThrowError();
    });

    it("should allow plain object route", () => {
      expect(() => {
        validateRoute({ name: "plain", path: "/plain" }, methodName);
      }).not.toThrowError();
    });
  });

  describe("structure validation", () => {
    it("should throw for missing name", () => {
      expect(() => {
        validateRoute({ path: "/test" }, methodName);
      }).toThrowError();
    });

    it("should throw for empty name", () => {
      expect(() => {
        validateRoute({ name: "", path: "/test" }, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute({ name: "", path: "/test" }, methodName);
      }).toThrowError("[router.add] Route name cannot be empty");
    });

    it("should throw for whitespace-only name", () => {
      expect(() => {
        validateRoute({ name: "   ", path: "/test" }, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute({ name: "   ", path: "/test" }, methodName);
      }).toThrowError("[router.add] Route name cannot contain only whitespace");
    });

    it("should throw for name exceeding maximum length", () => {
      const longName = "a".repeat(10_001);

      expect(() => {
        validateRoute({ name: longName, path: "/test" }, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute({ name: longName, path: "/test" }, methodName);
      }).toThrowError(/exceeds maximum length of 10000 characters/);
    });

    it("should accept system routes with @@ prefix", () => {
      expect(() => {
        validateRoute(
          { name: "@@real-router/UNKNOWN", path: "/unknown" },
          methodName,
        );
      }).not.toThrowError();
    });

    it("should throw for invalid route name pattern (non-ASCII)", () => {
      expect(() => {
        validateRoute({ name: "café", path: "/cafe" }, methodName);
      }).toThrowError(TypeError);
      expect(() => {
        validateRoute({ name: "café", path: "/cafe" }, methodName);
      }).toThrowError(/Invalid route name/);
    });

    it("should throw for missing path", () => {
      expect(() => {
        validateRoute({ name: "test" }, methodName);
      }).toThrowError();
    });

    it("should accept valid route", () => {
      expect(() => {
        validateRoute({ name: "test", path: "/test" }, methodName);
      }).not.toThrowError();
    });
  });

  describe("tree duplicate detection", () => {
    it("should throw when route name exists in tree", () => {
      const rootNode = createMockRouteNode("", "", [
        { name: "users", path: "/users" },
      ]);

      expect(() => {
        validateRoute({ name: "users", path: "/u" }, methodName, rootNode);
      }).toThrowError('[router.add] Route "users" already exists');
    });

    it("should throw when nested route name exists", () => {
      const rootNode = createMockRouteNode("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/profile" }],
        },
      ]);

      expect(() => {
        validateRoute(
          { name: "users.profile", path: "/p" },
          methodName,
          rootNode,
        );
      }).toThrowError('[router.add] Route "users.profile" already exists');
    });

    it("should throw when path exists in tree", () => {
      const rootNode = createMockRouteNode("", "", [
        { name: "users", path: "/users" },
      ]);

      expect(() => {
        validateRoute({ name: "people", path: "/users" }, methodName, rootNode);
      }).toThrowError('[router.add] Path "/users" is already defined');
    });

    it("should not throw when route does not exist", () => {
      const rootNode = createMockRouteNode("", "", [
        { name: "users", path: "/users" },
      ]);

      expect(() => {
        validateRoute(
          { name: "settings", path: "/settings" },
          methodName,
          rootNode,
        );
      }).not.toThrowError();
    });

    it("should throw when path exists at nested level", () => {
      const rootNode = createMockRouteNode("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/profile" }],
        },
      ]);

      expect(() => {
        validateRoute(
          { name: "users.settings", path: "/profile" },
          methodName,
          rootNode,
        );
      }).toThrowError('[router.add] Path "/profile" is already defined');
    });

    it("should not throw when parent does not exist for path check", () => {
      const rootNode = createMockRouteNode("", "", [
        { name: "users", path: "/users" },
      ]);

      // When validating children, parent "nonexistent" won't be found
      // This covers the branch where parentNode is undefined
      expect(() => {
        validateRoute(
          { name: "test", path: "/test" },
          methodName,
          rootNode,
          "nonexistent",
        );
      }).not.toThrowError();
    });
  });

  describe("batch duplicate detection", () => {
    it("should throw when route name exists in batch", () => {
      const seenNames = new Set(["users"]);

      expect(() => {
        validateRoute(
          { name: "users", path: "/u" },
          methodName,
          undefined,
          "",
          seenNames,
        );
      }).toThrowError('[router.add] Duplicate route "users" in batch');
    });

    it("should add name to seenNames set", () => {
      const seenNames = new Set<string>();

      validateRoute(
        { name: "users", path: "/users" },
        methodName,
        undefined,
        "",
        seenNames,
      );

      expect(seenNames.has("users")).toBe(true);
    });

    it("should throw when path exists in batch", () => {
      const seenPaths = new Map<string, Set<string>>([
        ["", new Set(["/users"])],
      ]);

      expect(() => {
        validateRoute(
          { name: "people", path: "/users" },
          methodName,
          undefined,
          "",
          undefined,
          seenPaths,
        );
      }).toThrowError('[router.add] Path "/users" is already defined');
    });

    it("should add path to seenPaths map", () => {
      const seenPaths = new Map<string, Set<string>>();

      validateRoute(
        { name: "users", path: "/users" },
        methodName,
        undefined,
        "",
        undefined,
        seenPaths,
      );

      expect(seenPaths.get("")?.has("/users")).toBe(true);
    });

    it("should add multiple paths to same level", () => {
      const seenPaths = new Map<string, Set<string>>();

      validateRoute(
        { name: "users", path: "/users" },
        methodName,
        undefined,
        "",
        undefined,
        seenPaths,
      );
      validateRoute(
        { name: "settings", path: "/settings" },
        methodName,
        undefined,
        "",
        undefined,
        seenPaths,
      );

      expect(seenPaths.get("")?.has("/users")).toBe(true);
      expect(seenPaths.get("")?.has("/settings")).toBe(true);
    });
  });

  describe("children validation", () => {
    it("should throw when children is not an array", () => {
      expect(() => {
        validateRoute(
          { name: "test", path: "/test", children: "invalid" },
          methodName,
        );
      }).toThrowError(
        '[router.add] Route "test" children must be an array, got string',
      );
    });

    it("should include constructor name in error message for class instances", () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class CustomClass {}

      expect(() => {
        validateRoute(
          { name: "test", path: "/test", children: new CustomClass() },
          methodName,
        );
      }).toThrowError(
        '[router.add] Route "test" children must be an array, got CustomClass',
      );
    });

    it("should distinguish plain objects from class instances", () => {
      expect(() => {
        validateRoute(
          { name: "test", path: "/test", children: {} },
          methodName,
        );
      }).toThrowError(
        '[router.add] Route "test" children must be an array, got object',
      );
    });

    it("should validate children recursively", () => {
      expect(() => {
        validateRoute(
          {
            name: "parent",
            path: "/parent",
            children: [{ name: "child" }], // missing path
          },
          methodName,
        );
      }).toThrowError();
    });

    it("should accept valid nested routes", () => {
      expect(() => {
        validateRoute(
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
          methodName,
        );
      }).not.toThrowError();
    });

    it("should detect duplicate names in nested children", () => {
      const seenNames = new Set<string>();

      expect(() => {
        validateRoute(
          {
            name: "parent",
            path: "/parent",
            children: [
              { name: "child", path: "/child1" },
              { name: "child", path: "/child2" },
            ],
          },
          methodName,
          undefined,
          "",
          seenNames,
        );
      }).toThrowError('[router.add] Duplicate route "parent.child" in batch');
    });

    it("should detect duplicate paths in nested children", () => {
      const seenPaths = new Map<string, Set<string>>();

      expect(() => {
        validateRoute(
          {
            name: "parent",
            path: "/parent",
            children: [
              { name: "child1", path: "/same" },
              { name: "child2", path: "/same" },
            ],
          },
          methodName,
          undefined,
          "",
          undefined,
          seenPaths,
        );
      }).toThrowError('[router.add] Path "/same" is already defined');
    });
  });

  describe("full name building", () => {
    it("should build full name with parent", () => {
      const seenNames = new Set<string>();

      validateRoute(
        { name: "profile", path: "/profile" },
        methodName,
        undefined,
        "users",
        seenNames,
      );

      expect(seenNames.has("users.profile")).toBe(true);
    });

    it("should use simple name when no parent", () => {
      const seenNames = new Set<string>();

      validateRoute(
        { name: "users", path: "/users" },
        methodName,
        undefined,
        "",
        seenNames,
      );

      expect(seenNames.has("users")).toBe(true);
    });
  });

  describe("parent existence validation (dot-notation)", () => {
    it("should accept route with dot-notation when parent exists in batch", () => {
      const seenNames = new Set<string>(["users"]);

      expect(() => {
        validateRoute(
          { name: "users.profile", path: "/profile" },
          methodName,
          undefined,
          "",
          seenNames,
        );
      }).not.toThrowError();
    });

    it("should throw when dot-notation parent does not exist in tree", () => {
      const rootNode = createMockRouteNode("", "", [
        { name: "admin", path: "/admin" },
      ]);

      expect(() => {
        validateRoute(
          { name: "users.profile", path: "/profile" },
          methodName,
          rootNode,
        );
      }).toThrowError(
        '[router.add] Parent route "users" does not exist for route "users.profile"',
      );
    });

    it("should throw when dot-notation parent does not exist (no tree, no batch)", () => {
      expect(() => {
        validateRoute({ name: "users.profile", path: "/profile" }, methodName);
      }).toThrowError(
        '[router.add] Parent route "users" does not exist for route "users.profile"',
      );
    });
  });

  describe("mutation testing coverage", () => {
    it("should accept exactly MAX_ROUTE_NAME_LENGTH (10000) characters (line 191 boundary)", () => {
      // Test exact boundary: 10000 chars should pass, 10001 should fail
      const exactLengthName = "a".repeat(10_000);

      expect(() => {
        validateRoute({ name: exactLengthName, path: "/test" }, methodName);
      }).not.toThrowError();
    });

    it("should compute correct parentName with multi-level dot notation (line 321)", () => {
      // Test that "a.b.c" extracts parent "a.b" not "ab"
      // If parts.join(".") was changed to parts.join(""), parent would be "ab" not "a.b"
      const rootNode = createMockRouteNode("", "", [
        {
          name: "a",
          path: "/a",
          children: [{ name: "b", path: "/b" }],
        },
      ]);

      // Should succeed because parent "a.b" exists
      expect(() => {
        validateRoute({ name: "a.b.c", path: "/c" }, methodName, rootNode);
      }).not.toThrowError();

      // Should fail if parent check used wrong separator
      const rootNodeMissing = createMockRouteNode("", "", [
        { name: "ab", path: "/ab" }, // "ab" exists but "a.b" does not
      ]);

      expect(() => {
        validateRoute(
          { name: "a.b.c", path: "/c" },
          methodName,
          rootNodeMissing,
        );
      }).toThrowError(/Parent route "a.b" does not exist/);
    });

    it("should compute correct pathCheckParent with multi-level dot notation (line 458, 463)", () => {
      // When routeName is "a.b.c" and parentName is "", pathCheckParent should be "a.b"
      // If parts.join(".") was changed to parts.join(""), pathCheckParent would be "ab"
      const seenPaths = new Map<string, Set<string>>();
      const seenNames = new Set<string>(["a", "a.b"]); // Parents exist

      // First add a route at level "a.b"
      seenPaths.set("a.b", new Set(["/existing"]));

      // Now validate "a.b.c" - should check paths at "a.b" level
      expect(() => {
        validateRoute(
          { name: "a.b.c", path: "/existing" }, // Same path
          methodName,
          undefined,
          "",
          seenNames,
          seenPaths,
        );
      }).toThrowError('[router.add] Path "/existing" is already defined');
    });

    it("should NOT enter pathCheckParent branch when parentName is set (line 458 && !parentName)", () => {
      // When parentName is already set (recursive call), should not extract from routeName
      const seenPaths = new Map<string, Set<string>>();
      const seenNames = new Set<string>();

      // Simulate recursive validation with parentName set
      // Even if routeName contains ".", parentName being set should skip extraction
      validateRoute(
        { name: "child.name", path: "/child" }, // routeName with dot
        methodName,
        undefined,
        "parent", // parentName is set - should NOT extract from routeName
        seenNames,
        seenPaths,
      );

      // Path should be checked at "parent" level, not at "child" level
      expect(seenPaths.has("parent")).toBe(true);
      expect(seenPaths.get("parent")?.has("/child")).toBe(true);
    });

    it("should NOT enter pathCheckParent branch when routeName has no dot (line 458 includes)", () => {
      const seenPaths = new Map<string, Set<string>>();
      const seenNames = new Set<string>();

      // Route without dot in name
      validateRoute(
        { name: "simple", path: "/simple" },
        methodName,
        undefined,
        "", // No parent
        seenNames,
        seenPaths,
      );

      // Path should be checked at root level ""
      expect(seenPaths.has("")).toBe(true);
      expect(seenPaths.get("")?.has("/simple")).toBe(true);
    });
  });

  describe("encodeParams/decodeParams validation", () => {
    it("should throw when encodeParams is not a function", () => {
      expect(() => {
        validateRoute(
          {
            name: "test",
            path: "/test",
            encodeParams: "not-a-function",
          },
          methodName,
        );
      }).toThrowError(
        '[router.add] Route "test" encodeParams must be a function',
      );
    });

    it("should throw when decodeParams is not a function", () => {
      expect(() => {
        validateRoute(
          {
            name: "test",
            path: "/test",
            decodeParams: 123,
          },
          methodName,
        );
      }).toThrowError(
        '[router.add] Route "test" decodeParams must be a function',
      );
    });

    it("should accept valid encode/decode functions", () => {
      expect(() => {
        validateRoute(
          {
            name: "test",
            path: "/test",
            encodeParams: (p: unknown) => p,
            decodeParams: (p: unknown) => p,
          },
          methodName,
        );
      }).not.toThrowError();
    });
  });
});
