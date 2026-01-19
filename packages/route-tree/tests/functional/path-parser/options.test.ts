/**
 * Path options tests.
 *
 * Tests for trailing slash, case sensitivity, and delimiter options.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../modules/parser/path-parser";

describe("Path options", () => {
  describe("trailing slash", () => {
    it("should match paths with optional trailing slashes", () => {
      let path = new Path("/my-path");

      expect(path.test("/my-path/", { strictTrailingSlash: true })).toBeNull();
      expect(
        path.test("/my-path/", { strictTrailingSlash: false }),
      ).toStrictEqual({});

      path = new Path("/my-path/");

      expect(path.test("/my-path", { strictTrailingSlash: true })).toBeNull();
      expect(
        path.test("/my-path", { strictTrailingSlash: false }),
      ).toStrictEqual({});

      path = new Path("/");

      expect(path.test("", { strictTrailingSlash: true })).toBeNull();
      expect(path.test("", { strictTrailingSlash: false })).toBeNull();
      expect(path.test("/", { strictTrailingSlash: true })).toStrictEqual({});
    });

    it("should build paths with trailing slash preserved", () => {
      const pathWithSlash = new Path("/users/");

      expect(pathWithSlash.build({})).toBe("/users/");

      const pathWithoutSlash = new Path("/users");

      expect(pathWithoutSlash.build({})).toBe("/users");
    });
  });

  describe("case sensitivity", () => {
    it("should be case insensitive by default", () => {
      const path = new Path("/test");

      expect(path.test("/test")).toStrictEqual({});
      expect(path.test("/Test")).toStrictEqual({});
      expect(path.test("/TEST")).toStrictEqual({});
    });

    it("should respect caseSensitive option", () => {
      const path = new Path("/test");

      expect(path.test("/TEST", { caseSensitive: true })).toBeNull();
      expect(path.test("/test", { caseSensitive: true })).toStrictEqual({});
    });

    it("should match parameters case insensitively", () => {
      const path = new Path("/Users/:id");

      expect(path.test("/users/123")).toStrictEqual({ id: "123" });
      expect(path.test("/USERS/456")).toStrictEqual({ id: "456" });
    });
  });

  describe("delimited partial matching", () => {
    it("should partial match up to a delimiter", () => {
      const path = new Path("/univers");

      expect(path.partialTest("/university")).toBeNull();
      expect(
        path.partialTest("/university", { delimited: false }),
      ).toStrictEqual({});
      expect(path.partialTest("/univers/hello")).toStrictEqual({});
    });

    it("should respect delimiter boundaries with parameters", () => {
      const path = new Path("/users/:id");

      expect(path.partialTest("/users/123/profile")).toStrictEqual({
        id: "123",
      });
      expect(path.partialTest("/users/123?query=val")).toStrictEqual({
        id: "123",
      });
    });
  });
});
