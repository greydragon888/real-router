/**
 * URL parameters tests.
 *
 * Tests for matching and building paths with URL parameters.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../modules/parser/path-parser";

describe("Path URL parameters", () => {
  describe("non-encodable values", () => {
    it("should treat object values as undefined when building", () => {
      const path = new Path("/users/:id");

      // Object values are not encodable - isEncodableParam returns false
      // The value becomes undefined in encoded params, which converts to "undefined"
      expect(path.build({ id: { nested: "value" } as unknown as string })).toBe(
        "/users/undefined",
      );
    });

    it("should treat arrays with non-primitive values as undefined", () => {
      const path = new Path("/users/:id");

      // Arrays with objects are not encodable - isEncodableParam returns false
      expect(path.build({ id: [{ a: 1 }] as unknown as string[] })).toBe(
        "/users/undefined",
      );
    });
  });

  describe("basic URL parameters", () => {
    it("should match and build paths with url parameters", () => {
      const path = new Path("/users/profile/:id-:id2.html");

      expect(path.test("/users/profile/123-abc.html")).toStrictEqual({
        id: "123",
        id2: "abc",
      });
      expect(
        path.partialTest("/users/profile/123-abc.html?what"),
      ).toStrictEqual({
        id: "123",
        id2: "abc",
      });
      expect(path.test("/users/details/123-abc")).toBeNull();
      expect(path.test("/users/details/123-abc.html")).toBeNull();
      expect(path.test("/users/profile/123-abc.html?what")).toBeNull();

      expect(path.build({ id: "123", id2: "abc" })).toBe(
        "/users/profile/123-abc.html",
      );
    });

    it("should throw when building with missing parameters", () => {
      const path = new Path("/users/profile/:id-:id2.html");

      expect(() => {
        path.build({ id: "123" });
      }).toThrowError(
        "Cannot build path: '/users/profile/:id-:id2.html' requires missing parameters { id2 }",
      );
    });
  });

  describe("constrained parameters", () => {
    it("should match numeric constraints", () => {
      const path = new Path(String.raw`/users/:id<\d+>`);

      expect(path.build({ id: 99 })).toBe("/users/99");
      expect(path.test("/users/11")).toStrictEqual({ id: "11" });
      expect(path.test("/users/thomas")).toBeDefined();
    });

    it("should match hex constraints", () => {
      const path = new Path("/users/;id<[A-F0-9]{6}>");

      expect(path.build({ id: "A76FE4" })).toBe("/users/;id=A76FE4");
      expect(path.test("/users/;id=A76FE4")).toStrictEqual({ id: "A76FE4" });
      expect(path.test("/users;id=Z12345")).toBeDefined();
    });

    it("should throw when building with invalid constraint", () => {
      const path = new Path("/users/;id<[A-F0-9]{6}>");

      expect(() => {
        path.build({ id: "incorrect-param" });
      }).toThrowError();
    });

    it("should allow ignoring constraints when building", () => {
      const path = new Path("/users/;id<[A-F0-9]{6}>");

      expect(path.build({ id: "fake" }, { ignoreConstraints: true })).toBe(
        "/users/;id=fake",
      );
    });

    it("should show default pattern in error when param has no explicit constraint", () => {
      // Tests the branch in validateConstraints where constraint is empty
      // The error message should show "[^/]+" as the default constraint description
      const path = new Path("/users/:id");

      // Empty string fails the default pattern [a-zA-Z0-9_.~%':|=+*@$-]+
      // because the pattern requires at least one character (+)
      expect(() => {
        path.build({ id: "" });
      }).toThrowError(/expected to match '\[\^\/]\+'/);
    });
  });

  describe("boolean URL parameters", () => {
    it("should build with boolean URL parameter value", () => {
      // Tests encodeParamValue when val is boolean
      const path = new Path("/users/:active/profile");

      expect(path.build({ active: true })).toBe("/users/true/profile");
      expect(path.build({ active: false })).toBe("/users/false/profile");
    });
  });

  describe("special characters", () => {
    it("should match with star (*) as a parameter value", () => {
      const path = new Path("/test/:param");

      expect(path.build({ param: "super*" })).toBe("/test/super*");
      expect(path.test("/test/super*")).toStrictEqual({ param: "super*" });
    });

    it("should match with special characters in path", () => {
      const path = new Path("/test/:name/test2");

      expect(path.partialTest("/test/he:re/test2")).toStrictEqual({
        name: "he:re",
      });
      expect(path.partialTest("/test/he're/test2")).toStrictEqual({
        name: "he're",
      });
      expect(path.build({ name: "he're" })).toStrictEqual("/test/he're/test2");
    });

    it("should match unencoded pipes (Firefox)", () => {
      const path = new Path("/test/:param");

      expect(path.test("/test/1|2")).toStrictEqual({ param: "1|2" });
    });

    it("should support a wide range of characters", () => {
      const path = new Path("/test/:param");

      expect(path.test("/test/1+2=3@*")).toStrictEqual({ param: "1+2=3@*" });
    });
  });
});
