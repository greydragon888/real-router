/**
 * URL encoding tests.
 *
 * Tests for different URL encoding strategies.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../src/parser/path-parser";

describe("Path encoding", () => {
  describe("default encoding", () => {
    const path = new Path<{ param: string }>("/:param");

    it("should build with correct encoding", () => {
      expect(path.build({ param: "test$@" })).toBe("/test$%40");
    });

    it("should match with correct decoding", () => {
      expect(path.test("/test%24%40")).toStrictEqual({ param: "test$@" });
      expect(path.partialTest("/test$@")).toStrictEqual({ param: "test$@" });
    });
  });

  describe("uri encoding", () => {
    const path = new Path("/:param", {
      urlParamsEncoding: "uri",
    });

    it("should build with correct encoding", () => {
      expect(path.build({ param: "test$%" })).toBe("/test$%25");
    });

    it("should match with correct decoding", () => {
      expect(path.test("/test$%25")).toStrictEqual({ param: "test$%" });
      expect(path.partialTest("/test$@")).toStrictEqual({ param: "test$@" });
    });
  });

  describe("uriComponent encoding", () => {
    const path = new Path("/:param", {
      urlParamsEncoding: "uriComponent",
    });

    it("should build with correct encoding", () => {
      expect(path.build({ param: "test$@" })).toBe("/test%24%40");
    });

    it("should match with correct decoding", () => {
      expect(path.test("/test%24%40")).toStrictEqual({ param: "test$@" });
      expect(path.partialTest("/test$@")).toStrictEqual({ param: "test$@" });
    });
  });

  describe("no encoding", () => {
    const path = new Path("/:param", {
      urlParamsEncoding: "none",
    });

    it("should build without encoding", () => {
      expect(path.build({ param: "test$%" })).toBe("/test$%");
    });

    it("should match without decoding", () => {
      expect(path.test("/test$%25")).toStrictEqual({ param: "test$%25" });
    });
  });

  describe("encoded values", () => {
    it("should match paths with encoded values", () => {
      const path = new Path("/test/:id");

      expect(path.partialTest("/test/%7B123-456%7D")).toStrictEqual({
        id: "{123-456}",
      });
    });

    it("should encode values when building", () => {
      const path = new Path("/test/:id");

      expect(path.build({ id: "{123-456}" })).toBe("/test/%7B123-456%7D");
    });
  });

  describe("overwriting options", () => {
    const path = new Path<{ param: string; enabled?: boolean }>(
      "/:param?enabled",
      {
        queryParams: { booleanFormat: "string" },
        urlParamsEncoding: "uriComponent",
      },
    );

    it("should allow overwriting options when building", () => {
      expect(path.build({ param: "a+b", enabled: true })).toBe(
        "/a%2Bb?enabled=true",
      );
      expect(
        path.build(
          { param: "a+b", enabled: true },
          {
            queryParams: { booleanFormat: "empty-true" },
            urlParamsEncoding: "default",
          },
        ),
      ).toBe("/a+b?enabled");
    });

    it("should allow overwriting options when matching", () => {
      expect(path.test("/a+b?enabled")).toStrictEqual({
        param: "a+b",
        enabled: null,
      });
      expect(
        path.test("/a+b?enabled", {
          queryParams: { booleanFormat: "empty-true" },
        }),
      ).toStrictEqual({
        param: "a+b",
        enabled: true,
      });
    });
  });

  describe("array param encoding", () => {
    it("should encode array parameters in query string", () => {
      // Tests Path.ts array param encoding branch
      const path = new Path<{ id: string; tags?: string[] }>("/items/:id?tags");

      const result = path.build({ id: "123", tags: ["a", "b", "c"] });

      expect(result).toContain("tags=a");
      expect(result).toContain("tags=b");
      expect(result).toContain("tags=c");
    });

    it("should encode array parameters with brackets format", () => {
      const path = new Path<{ tags?: string[] }>("/items?tags", {
        queryParams: { arrayFormat: "brackets" },
      });

      const result = path.build({ tags: ["x", "y"] });

      expect(result).toContain("tags[]=x");
      expect(result).toContain("tags[]=y");
    });
  });

  describe("null/undefined URL param values", () => {
    it("should skip null URL param values", () => {
      // Tests Path.ts isEncodableParam - null early return for URL params
      // Note: null in query params becomes empty value, but URL params are skipped
      const path = new Path<{ id: string; extra?: string | null }>(
        "/items/:id/:extra",
      );

      // When extra is null, it should throw because it's required in path
      expect(() => path.build({ id: "123", extra: null })).toThrowError(
        /missing parameters/,
      );
    });

    it("should skip undefined URL param values", () => {
      // Tests Path.ts isEncodableParam - undefined early return
      const path = new Path<{ id: string; extra?: string }>(
        "/items/:id/:extra",
      );

      // When extra is undefined, it should throw because it's required in path
      expect(() => path.build({ id: "123" })).toThrowError(
        /missing parameters/,
      );
    });

    it("should work with optional matrix params", () => {
      // Optional matrix params can handle null/undefined
      const path = new Path<{ id: string; filter?: string | null }>(
        "/items/:id;filter",
      );

      // With filter defined
      const withFilter = path.build({ id: "123", filter: "active" });

      expect(withFilter).toBe("/items/123;filter=active");
    });
  });

  describe("array URL param encoding", () => {
    it("should encode array values as comma-separated string", () => {
      // Tests Path.ts encodeParamValue - array URL param encoding branch
      // Arrays in URL params are joined with comma
      const path = new Path<{ ids: string[] }>("/items/*ids");

      const result = path.build({ ids: ["a", "b", "c"] });

      // Splat params with arrays are joined by comma
      expect(result).toBe("/items/a,b,c");
    });

    it("should encode array values with special characters", () => {
      // Tests array encoding with urlParamsEncoding
      const path = new Path<{ segments: string[] }>("/path/*segments", {
        urlParamsEncoding: "uriComponent",
      });

      const result = path.build({ segments: ["foo", "bar+baz"] });

      // Array is comma-joined, each element is encoded
      expect(result).toBe("/path/foo,bar%2Bbaz");
    });
  });
});
