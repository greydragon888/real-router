import { describe, expect, it } from "vitest";

import { createRouteTree } from "../../../src/builder";
import { MatcherService } from "../../../src/services/MatcherService";

describe("MatcherService", () => {
  describe("registerTree", () => {
    it("should register a simple route tree", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      expect(service.hasRoute("home")).toBe(true);
    });

    it("should register nested routes", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users")).toBe(true);
      expect(service.hasRoute("users.profile")).toBe(true);
    });

    it("should register routes with absolute paths", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "admin", path: "~admin" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.admin")).toBe(true);
    });

    it("should register routes with query parameters in pattern", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("search")).toBe(true);
    });

    it("should register routes with splat parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("files")).toBe(true);
    });
  });

  describe("match", () => {
    it("should match a simple path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      const result = service.match("/");

      expect(result).toBeDefined();
      expect(result?.segments).toHaveLength(1);
      expect(result?.segments[0].name).toBe("home");
      expect(result?.params).toStrictEqual({});
    });

    it("should match path with URL parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/:id" },
      ]);

      service.registerTree(tree);

      const result = service.match("/users/123");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ id: "123" });
    });

    it("should match nested routes", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      service.registerTree(tree);

      const result = service.match("/users/123");

      expect(result).toBeDefined();
      expect(result?.segments).toHaveLength(2);
      expect(result?.segments[0].name).toBe("users");
      expect(result?.segments[1].name).toBe("profile");
      expect(result?.params).toStrictEqual({ id: "123" });
    });

    it("should append slash child to matched segments", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "profile",
          path: "/profile",
          children: [
            { name: "me", path: "/" },
            { name: "user", path: "/:userId" },
          ],
        },
      ]);

      service.registerTree(tree);

      const result = service.match("/profile");

      expect(result).toBeDefined();
      expect(result?.segments).toHaveLength(2);
      expect(result?.segments[0].name).toBe("profile");
      expect(result?.segments[1].name).toBe("me");
    });

    it("should match path with query parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=test");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test" });
    });

    it("should match path with multiple query parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=test&page=2");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test", page: "2" });
    });

    it("should match path with URL and query parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "users", path: "/users/:id" },
      ]);

      service.registerTree(tree);

      const result = service.match("/users/123?tab=profile");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ id: "123", tab: "profile" });
    });

    it("should match path with splat parameter", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      service.registerTree(tree);

      const result = service.match("/files/docs/readme.md");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ path: "docs/readme.md" });
    });

    it("should return undefined for non-matching path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      const result = service.match("/users");

      expect(result).toBeUndefined();
    });

    it("should reject paths without leading slash", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "index", path: "/" },
        { name: "users", path: "/users" },
      ]);

      service.registerTree(tree);

      const result = service.match("users");

      expect(result).toBeUndefined();
    });

    it("should reject paths with raw unicode characters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "users", path: "/users" }]);

      service.registerTree(tree);

      // Raw unicode should be rejected (should be URL-encoded as %E7%94%A8%E6%88%B7)
      const result = service.match("/用户");

      expect(result).toBeUndefined();
    });

    it("should normalize empty string to root path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "index", path: "/" }]);

      service.registerTree(tree);

      const result = service.match("");

      expect(result).toBeDefined();
      expect(result?.segments[0].name).toBe("index");
    });

    it("should register absolute path routes", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "admin", path: "~/admin" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.admin")).toBe(true);
    });

    it("should handle query parameter without value", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: null });
    });

    it("should decode URL-encoded query parameters", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=hello%20world");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "hello world" });
    });

    it("should handle array query parameters (non-string params)", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      // Array params are parsed as arrays by search-params
      const result = service.match("/search?arr[]=a&arr[]=b");

      expect(result).toBeDefined();
      expect(result?.params.arr).toStrictEqual(["a", "b"]);
    });

    it("should handle empty query parameter keys with equals", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?=value");

      expect(result).toBeDefined();
      // search-params library includes empty key with value
      expect(result?.params).toStrictEqual({ "": "value" });
    });

    it("should handle empty query parameter keys without equals", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?&q=test");

      expect(result).toBeDefined();
      // search-params library includes empty key as null
      expect(result?.params).toStrictEqual({ "": null, q: "test" });
    });

    it("should fall back to original matcher for case-sensitive matching", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "users", path: "/Users" }]);

      service.registerTree(tree);

      const resultLower = service.match("/users");
      const resultUpper = service.match("/Users");

      expect(resultLower).toBeUndefined();
      expect(resultUpper).toBeDefined();
      expect(resultUpper?.segments[0].name).toBe("users");
    });

    it("should fall back to original matcher for strict trailing slash", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "users", path: "/users" }]);

      service.registerTree(tree);

      const withSlash = service.match("/users/", {
        strictTrailingSlash: true,
      });
      const withoutSlash = service.match("/users", {
        strictTrailingSlash: true,
      });

      expect(withSlash).toBeUndefined();
      expect(withoutSlash).toBeDefined();
    });

    it("should fall back to original matcher for strict query params mode", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=test", {
        queryParamsMode: "strict",
      });

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test" });
    });

    it("should reject undeclared query params in strict mode", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=test&extra=ignored", {
        queryParamsMode: "strict",
      });

      expect(result).toBeUndefined();
    });

    it("should only include provided declared params in strict mode", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "search", path: "/search?q&page&limit" },
      ]);

      service.registerTree(tree);

      const result = service.match("/search?q=test", {
        queryParamsMode: "strict",
      });

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test" });
    });
  });

  describe("getSegmentsByName", () => {
    it("should return segments for existing route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      const segments = service.getSegmentsByName("home");

      expect(segments).toBeDefined();
      expect(segments).toHaveLength(1);
      expect(segments?.[0].name).toBe("home");
    });

    it("should return segments for nested route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      service.registerTree(tree);

      const segments = service.getSegmentsByName("users.profile");

      expect(segments).toBeDefined();
      expect(segments).toHaveLength(2);
      expect(segments?.[0].name).toBe("users");
      expect(segments?.[1].name).toBe("profile");
    });

    it("should return undefined for non-existing route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      const segments = service.getSegmentsByName("users");

      expect(segments).toBeUndefined();
    });
  });

  describe("hasRoute", () => {
    it("should return true for existing route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      expect(service.hasRoute("home")).toBe(true);
    });

    it("should return true for nested route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "profile", path: "/:id" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.profile")).toBe(true);
    });

    it("should return false for non-existing route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree);

      expect(service.hasRoute("users")).toBe(false);
    });
  });

  describe("syntax adapter (*path → **:path)", () => {
    it("should convert named splat to rou3 syntax", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      service.registerTree(tree);

      const result = service.match("/files/a/b/c");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ path: "a/b/c" });
    });

    it("should preserve query parameters during conversion", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        { name: "files", path: "/files/*path" },
      ]);

      service.registerTree(tree);

      const result = service.match("/files/docs/file.txt?download=true");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({
        path: "docs/file.txt",
        download: "true",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty parent path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      service.registerTree(tree, "");

      expect(service.hasRoute("home")).toBe(true);
    });

    it("should register routes with empty node path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "list", path: "" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.list")).toBe(true);
    });

    it("should handle path with query string in node path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "search", path: "/search" }],
        },
      ]);

      service.registerTree(tree);

      const result = service.match("/users/search?q=test");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test" });
    });

    it("should handle complex nested routes", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "app",
          path: "/app",
          children: [
            {
              name: "users",
              path: "/users",
              children: [
                { name: "profile", path: "/:id" },
                { name: "settings", path: "/:id/settings" },
              ],
            },
          ],
        },
      ]);

      service.registerTree(tree);

      const result = service.match("/app/users/123/settings");

      expect(result).toBeDefined();
      expect(result?.segments).toHaveLength(3);
      expect(result?.segments[0].name).toBe("app");
      expect(result?.segments[1].name).toBe("users");
      expect(result?.segments[2].name).toBe("settings");
      expect(result?.params).toStrictEqual({ id: "123" });
    });

    it("should handle route without fullName", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [{ name: "home", path: "/" }]);

      const modifiedChild = {
        ...[...tree.children.values()][0],
        fullName: "",
      };
      const modifiedTree = {
        ...tree,
        children: new Map([[modifiedChild.name, modifiedChild]]),
      };

      service.registerTree(modifiedTree);

      expect(service.hasRoute("")).toBe(false);
    });

    it("should handle absolute path in nested route", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "admin", path: "~/admin" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.admin")).toBe(true);

      const segments = service.getSegmentsByName("users.admin");

      expect(segments).toBeDefined();
      expect(segments).toHaveLength(2);
    });

    it("should handle nested route with query params in actual path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "search", path: "/search" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.search")).toBe(true);

      const result = service.match("/users/search?q=test&page=1");

      expect(result).toBeDefined();
      expect(result?.params).toStrictEqual({ q: "test", page: "1" });
    });

    it("should handle query params in nested node path pattern", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users",
          children: [{ name: "search", path: "/search?q&page" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.search")).toBe(true);
    });

    it("should handle query-only parent path with empty node path", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "?mode",
          children: [{ name: "child", path: "" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("root.child")).toBe(true);
    });

    it("should handle query-only parent path with node path without query", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "?mode",
          children: [{ name: "child", path: "/child" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("root.child")).toBe(true);
    });

    it("should handle query-only parent path with node path with query", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "root",
          path: "?mode",
          children: [{ name: "child", path: "/child?tab" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("root.child")).toBe(true);
    });

    it("should merge query params when parent has query and node has query", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users?sort",
          children: [{ name: "search", path: "/search?q" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.search")).toBe(true);
    });

    it("should handle parent with query params and node without query", () => {
      const service = new MatcherService();
      const tree = createRouteTree("", "", [
        {
          name: "users",
          path: "/users?sort",
          children: [{ name: "list", path: "/list" }],
        },
      ]);

      service.registerTree(tree);

      expect(service.hasRoute("users.list")).toBe(true);
    });
  });
});
