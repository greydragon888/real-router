import { describe, expect, it } from "vitest";

import { inject } from "../../../src/services/inject";

describe("inject", () => {
  describe("named parameters", () => {
    it("should inject pre-encoded named parameter", () => {
      expect(inject("/users/:id", { id: "123" })).toBe("/users/123");
    });

    it("should inject multiple named parameters", () => {
      expect(
        inject("/users/:userId/posts/:postId", { userId: "1", postId: "2" }),
      ).toBe("/users/1/posts/2");
    });

    it("should preserve placeholder for missing required parameter", () => {
      expect(inject("/users/:id", {})).toBe("/users/:id");
    });
  });

  describe("optional parameters", () => {
    it("should inject optional parameter when value provided", () => {
      expect(inject("/users/:id?", { id: "123" })).toBe("/users/123");
    });

    it("should omit optional parameter when value missing", () => {
      expect(inject("/users/:id?", {})).toBe("/users");
    });
  });

  describe("splat parameters", () => {
    it("should inject named splat parameter", () => {
      expect(inject("/files/*path", { path: "a/b/c" })).toBe("/files/a/b/c");
    });

    it("should inject unnamed splat parameter", () => {
      expect(inject("/files/*", { wild: "docs/readme.md" })).toBe(
        "/files/docs/readme.md",
      );
    });

    it("should omit splat parameter when value missing", () => {
      expect(inject("/files/*path", {})).toBe("/files");
    });
  });

  describe("complex routes", () => {
    it("should handle mixed parameter types", () => {
      expect(
        inject("/users/:id/files/*path", { id: "123", path: "docs/file.txt" }),
      ).toBe("/users/123/files/docs/file.txt");
    });

    it("should handle optional and required parameters", () => {
      expect(inject("/users/:id/posts/:postId?", { id: "1" })).toBe(
        "/users/1/posts",
      );
    });
  });

  describe("pre-encoded values", () => {
    it("should use pre-encoded values as-is", () => {
      expect(inject("/search/:q", { q: "hello%20world" })).toBe(
        "/search/hello%20world",
      );
    });

    it("should preserve encoded special characters", () => {
      expect(inject("/path/:segment", { segment: "a%2Fb" })).toBe(
        "/path/a%2Fb",
      );
    });
  });

  describe("constrained parameters", () => {
    it("strips constraints from named params", () => {
      expect(inject(String.raw`/users/:id<\d+>`, { id: "123" })).toBe(
        "/users/123",
      );
    });

    it("strips constraints from multiple params", () => {
      expect(
        inject("/:section<[A-Z]+>/*path", { section: "ABC", path: "x/y" }),
      ).toBe("/ABC/x/y");
    });

    it("handles optional constrained params with value", () => {
      expect(inject(String.raw`/:id<\d+>?`, { id: "42" })).toBe("/42");
    });

    it("handles optional constrained params without value", () => {
      expect(inject(String.raw`/:id<\d+>?`, {})).toBe("");
    });

    it("preserves unconstrained params behavior", () => {
      expect(inject("/users/:id", { id: "123" })).toBe("/users/123");
    });
  });
});
