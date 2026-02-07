/**
 * Tests for routeTreeToDefinitions function.
 *
 * Verifies conversion from RouteTree back to RouteDefinition[].
 *
 * @module tests/functional/routeTreeToDefinitions
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../src/builder";
import { routeTreeToDefinitions } from "../../src/operations/routeTreeToDefinitions";

describe("routeTreeToDefinitions", () => {
  describe("basic conversion", () => {
    it("should convert empty tree to empty array", () => {
      const tree = createRouteTree("", "", []);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions).toStrictEqual([]);
    });

    it("should convert simple flat routes", () => {
      const tree = createRouteTree("", "", [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      // Children are in definition order
      expect(definitions).toHaveLength(2);
      expect(definitions[0]).toStrictEqual({ name: "home", path: "/" });
      expect(definitions[1]).toStrictEqual({ name: "users", path: "/users" });
    });

    it("should convert nested routes", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions).toStrictEqual([
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);
    });

    it("should convert deeply nested routes", () => {
      const tree = createRouteTree("", "", [
        {
          name: "app",
          path: "/app",
          children: [
            {
              name: "dashboard",
              path: "/dashboard",
              children: [
                {
                  name: "stats",
                  path: "/stats",
                  children: [{ name: "daily", path: "/daily" }],
                },
              ],
            },
          ],
        },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions).toStrictEqual([
        {
          name: "app",
          path: "/app",
          children: [
            {
              name: "dashboard",
              path: "/dashboard",
              children: [
                {
                  name: "stats",
                  path: "/stats",
                  children: [{ name: "daily", path: "/daily" }],
                },
              ],
            },
          ],
        },
      ]);
    });
  });

  describe("edge cases", () => {
    it("should not include children property when node has no children", () => {
      const tree = createRouteTree("", "", [{ name: "about", path: "/about" }]);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions[0]).toStrictEqual({ name: "about", path: "/about" });
      expect(definitions[0]).not.toHaveProperty("children");
    });

    it("should handle routes with absolute paths", () => {
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [
            { name: "admin", path: "~/admin" },
            { name: "profile", path: "/:id" },
          ],
        },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      // Should preserve the absolute path marker in the path
      expect(definitions[0].children).toContainEqual({
        name: "admin",
        path: "~/admin",
      });
    });

    it("should handle routes with query parameters", () => {
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?query&page" },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions[0]).toStrictEqual({
        name: "search",
        path: "/search?query&page",
      });
    });

    it("should handle routes with splat parameters", () => {
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      const definitions = routeTreeToDefinitions(tree);

      expect(definitions[0]).toStrictEqual({
        name: "files",
        path: "/files/*path",
      });
    });
  });

  describe("roundtrip conversion", () => {
    it("should produce definitions that can rebuild an equivalent tree", () => {
      const originalDefinitions = [
        {
          name: "users",
          path: "/users",
          children: [
            { name: "list", path: "/" },
            { name: "profile", path: "/:id" },
          ],
        },
        { name: "home", path: "/" },
      ];

      const tree1 = createRouteTree("", "", originalDefinitions);
      const extractedDefinitions = routeTreeToDefinitions(tree1);
      const tree2 = createRouteTree("", "", extractedDefinitions);

      // Both trees should have the same structure
      expect(tree2.children).toHaveLength(tree1.children.size);
      expect([...tree2.children.values()][0].name).toBe(
        [...tree1.children.values()][0].name,
      );
      expect([...tree2.children.values()][0].path).toBe(
        [...tree1.children.values()][0].path,
      );
      expect([...tree2.children.values()][0].children).toHaveLength(
        [...tree1.children.values()][0].children.size,
      );
    });
  });
});
