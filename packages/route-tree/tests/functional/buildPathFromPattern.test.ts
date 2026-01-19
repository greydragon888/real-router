/**
 * Tests for standalone buildPathFromPattern function.
 *
 * This tests the R4 optimization extracted as a standalone function.
 */

import { describe, it, expect } from "vitest";

import {
  buildFromPattern,
  buildPathOnce,
  compilePathPattern,
} from "../../modules/parser/path-parser/buildPathFromPattern";

import type { CompiledPathPattern } from "../../modules/parser/path-parser/buildPathFromPattern";

describe("compilePathPattern", () => {
  describe("static patterns", () => {
    it("should compile pattern without parameters", () => {
      const compiled = compilePathPattern("/users");

      expect(compiled.staticParts).toStrictEqual(["/users"]);
      expect(compiled.paramNames).toStrictEqual([]);
      expect(compiled.pattern).toBe("/users");
    });

    it("should compile root path", () => {
      const compiled = compilePathPattern("/");

      expect(compiled.staticParts).toStrictEqual(["/"]);
      expect(compiled.paramNames).toStrictEqual([]);
    });

    it("should compile empty string", () => {
      const compiled = compilePathPattern("");

      expect(compiled.staticParts).toStrictEqual([""]);
      expect(compiled.paramNames).toStrictEqual([]);
    });
  });

  describe("URL parameters", () => {
    it("should compile single parameter", () => {
      const compiled = compilePathPattern("/users/:id");

      expect(compiled.staticParts).toStrictEqual(["/users/", ""]);
      expect(compiled.paramNames).toStrictEqual(["id"]);
    });

    it("should compile multiple parameters", () => {
      const compiled = compilePathPattern("/users/:id/posts/:postId");

      expect(compiled.staticParts).toStrictEqual(["/users/", "/posts/", ""]);
      expect(compiled.paramNames).toStrictEqual(["id", "postId"]);
    });

    it("should compile adjacent parameters", () => {
      const compiled = compilePathPattern("/:a:b:c");

      expect(compiled.staticParts).toStrictEqual(["/", "", "", ""]);
      expect(compiled.paramNames).toStrictEqual(["a", "b", "c"]);
    });

    it("should compile parameter at start", () => {
      const compiled = compilePathPattern(":id/users");

      expect(compiled.staticParts).toStrictEqual(["", "/users"]);
      expect(compiled.paramNames).toStrictEqual(["id"]);
    });

    it("should handle optional parameter syntax", () => {
      const compiled = compilePathPattern("/users/:id?");

      expect(compiled.staticParts).toStrictEqual(["/users/", ""]);
      expect(compiled.paramNames).toStrictEqual(["id"]);
    });
  });

  describe("wildcard parameters", () => {
    it("should compile bare wildcard", () => {
      const compiled = compilePathPattern("/files/*");

      expect(compiled.staticParts).toStrictEqual(["/files/", ""]);
      expect(compiled.paramNames).toStrictEqual(["splat"]);
    });

    it("should compile named wildcard", () => {
      const compiled = compilePathPattern("/files/*path");

      expect(compiled.staticParts).toStrictEqual(["/files/", ""]);
      expect(compiled.paramNames).toStrictEqual(["path"]);
    });
  });

  describe("matrix parameters", () => {
    it("should compile matrix parameter", () => {
      const compiled = compilePathPattern("/users;id=");

      expect(compiled.staticParts).toStrictEqual(["/users;id=", ""]);
      expect(compiled.paramNames).toStrictEqual(["id"]);
    });

    it("should compile matrix parameter without trailing =", () => {
      const compiled = compilePathPattern("/users;id");

      expect(compiled.staticParts).toStrictEqual(["/users;id=", ""]);
      expect(compiled.paramNames).toStrictEqual(["id"]);
    });

    it("should compile mixed URL and matrix parameters", () => {
      const compiled = compilePathPattern("/users/:id;version=");

      expect(compiled.staticParts).toStrictEqual(["/users/", ";version=", ""]);
      expect(compiled.paramNames).toStrictEqual(["id", "version"]);
    });
  });

  describe("complex patterns", () => {
    it("should compile API-style pattern", () => {
      const compiled = compilePathPattern(
        "/api/:version/:resource/:id/:action",
      );

      expect(compiled.staticParts).toStrictEqual(["/api/", "/", "/", "/", ""]);
      expect(compiled.paramNames).toStrictEqual([
        "version",
        "resource",
        "id",
        "action",
      ]);
    });

    it("should compile pattern with file extension", () => {
      const compiled = compilePathPattern("/files/:name.json");

      expect(compiled.staticParts).toStrictEqual(["/files/", ".json"]);
      expect(compiled.paramNames).toStrictEqual(["name"]);
    });
  });
});

describe("buildFromPattern", () => {
  describe("static patterns", () => {
    it("should return static pattern unchanged", () => {
      const compiled = compilePathPattern("/users");

      expect(buildFromPattern(compiled, {})).toBe("/users");
    });

    it("should return root path", () => {
      const compiled = compilePathPattern("/");

      expect(buildFromPattern(compiled, {})).toBe("/");
    });
  });

  describe("URL parameters", () => {
    it("should inject single parameter", () => {
      const compiled = compilePathPattern("/users/:id");

      expect(buildFromPattern(compiled, { id: "123" })).toBe("/users/123");
    });

    it("should inject multiple parameters", () => {
      const compiled = compilePathPattern("/users/:id/posts/:postId");

      expect(buildFromPattern(compiled, { id: "123", postId: "456" })).toBe(
        "/users/123/posts/456",
      );
    });

    it("should handle empty string parameter", () => {
      const compiled = compilePathPattern("/users/:id");

      expect(buildFromPattern(compiled, { id: "" })).toBe("/users/");
    });

    it("should handle special characters in parameters", () => {
      const compiled = compilePathPattern("/search/:query");

      expect(buildFromPattern(compiled, { query: "hello world" })).toBe(
        "/search/hello world",
      );
    });
  });

  describe("wildcard parameters", () => {
    it("should inject bare wildcard", () => {
      const compiled = compilePathPattern("/files/*");

      expect(buildFromPattern(compiled, { splat: "path/to/file" })).toBe(
        "/files/path/to/file",
      );
    });

    it("should inject named wildcard", () => {
      const compiled = compilePathPattern("/files/*path");

      expect(buildFromPattern(compiled, { path: "a/b/c" })).toBe(
        "/files/a/b/c",
      );
    });
  });

  describe("matrix parameters", () => {
    it("should inject matrix parameter", () => {
      const compiled = compilePathPattern("/users;id=");

      expect(buildFromPattern(compiled, { id: "123" })).toBe("/users;id=123");
    });

    it("should inject mixed parameters", () => {
      const compiled = compilePathPattern("/users/:id;version=");

      expect(buildFromPattern(compiled, { id: "123", version: "2" })).toBe(
        "/users/123;version=2",
      );
    });
  });

  describe("performance characteristics", () => {
    it("should handle many parameters efficiently", () => {
      const compiled = compilePathPattern(
        "/a/:p1/b/:p2/c/:p3/d/:p4/e/:p5/f/:p6/g/:p7/h/:p8/i/:p9/j/:p10",
      );

      const params = {
        p1: "v1",
        p2: "v2",
        p3: "v3",
        p4: "v4",
        p5: "v5",
        p6: "v6",
        p7: "v7",
        p8: "v8",
        p9: "v9",
        p10: "v10",
      };

      expect(buildFromPattern(compiled, params)).toBe(
        "/a/v1/b/v2/c/v3/d/v4/e/v5/f/v6/g/v7/h/v8/i/v9/j/v10",
      );
    });

    it("should reuse compiled pattern for multiple builds", () => {
      const compiled = compilePathPattern("/users/:id");

      expect(buildFromPattern(compiled, { id: "1" })).toBe("/users/1");
      expect(buildFromPattern(compiled, { id: "2" })).toBe("/users/2");
      expect(buildFromPattern(compiled, { id: "3" })).toBe("/users/3");
    });
  });
});

describe("buildPathOnce", () => {
  it("should build path in one call", () => {
    expect(buildPathOnce("/users/:id", { id: "123" })).toBe("/users/123");
  });

  it("should handle complex patterns", () => {
    expect(
      buildPathOnce("/api/:version/:resource/:id", {
        version: "v2",
        resource: "users",
        id: "42",
      }),
    ).toBe("/api/v2/users/42");
  });

  it("should handle static patterns", () => {
    expect(buildPathOnce("/static/path", {})).toBe("/static/path");
  });
});

describe("CompiledPathPattern interface", () => {
  it("should be immutable (readonly)", () => {
    const compiled: CompiledPathPattern = compilePathPattern("/users/:id");

    // TypeScript should prevent mutation - these would fail type-check:
    // compiled.staticParts = [];  // Error
    // compiled.paramNames = [];   // Error
    // compiled.pattern = "";      // Error

    expect(compiled.staticParts).toBeDefined();
    expect(compiled.paramNames).toBeDefined();
    expect(compiled.pattern).toBeDefined();
  });
});
