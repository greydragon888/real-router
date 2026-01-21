/**
 * Splat (wildcard) parameters tests.
 *
 * Tests for matching and building paths with splat parameters.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../src/parser/path-parser";

describe("Path splat parameters", () => {
  describe("basic splat", () => {
    const path = new Path("/users/*splat");

    it("should detect splat param", () => {
      expect(path.hasSpatParam).toBe(true);
    });

    it("should match simple splat", () => {
      expect(path.test("/users/profile/123")).toStrictEqual({
        splat: "profile/123",
      });
    });

    it("should match deep splat", () => {
      expect(path.test("/users/admin/manage/view/123")).toStrictEqual({
        splat: "admin/manage/view/123",
      });
    });

    it("should build with splat", () => {
      expect(path.build({ splat: "profile/123" })).toBe("/users/profile/123");
    });
  });

  describe("splat with URL parameters", () => {
    const path = new Path("/users/*splat/view/:id");

    it("should detect splat param", () => {
      expect(path.hasSpatParam).toBe(true);
    });

    it("should match splat with URL param", () => {
      expect(path.test("/users/profile/view/123")).toStrictEqual({
        splat: "profile",
        id: "123",
      });
    });

    it("should match deep splat with URL param", () => {
      expect(path.test("/users/admin/manage/view/123")).toStrictEqual({
        splat: "admin/manage",
        id: "123",
      });
    });
  });

  describe("splat with URL and query parameters", () => {
    const path = new Path("/:section/*splat?id");

    it("should detect splat param", () => {
      expect(path.hasSpatParam).toBe(true);
    });

    it("should match all parameter types", () => {
      expect(path.test("/users/profile/view?id=123")).toStrictEqual({
        section: "users",
        splat: "profile/view",
        id: "123",
      });
    });

    it("should build all parameter types", () => {
      expect(
        path.build({ section: "users", splat: "profile/view", id: "123" }),
      ).toBe("/users/profile/view?id=123");
    });
  });
});
