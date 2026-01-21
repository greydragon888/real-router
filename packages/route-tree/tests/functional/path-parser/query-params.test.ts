/**
 * Query parameters tests.
 *
 * Tests for matching and building paths with query parameters.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../src/parser/path-parser";

describe("Path query parameters", () => {
  describe("basic query parameters", () => {
    const path = new Path("/users?offset&limit", {
      queryParams: { booleanFormat: "string" },
    });

    it("should match query parameters", () => {
      expect(path.test("/users?offset=31&limit=15")).toStrictEqual({
        offset: "31",
        limit: "15",
      });
    });

    it("should match repeated query parameters as array", () => {
      expect(path.test("/users?offset=31&offset=30&limit=15")).toStrictEqual({
        offset: ["31", "30"],
        limit: "15",
      });
    });

    it("should match partial query parameters", () => {
      expect(path.test("/users?limit=15")).toStrictEqual({ limit: "15" });
    });

    it("should partial match with extra params", () => {
      expect(path.partialTest("/users?offset=true&limits=1")).toStrictEqual({
        offset: true,
      });
    });

    it("should partial match with encoded spaces", () => {
      expect(
        path.partialTest("/users?offset=1&offset=2%202&limits=1"),
      ).toStrictEqual({
        offset: ["1", "2 2"],
      });
    });

    it("should partial match with 3+ repeated query parameters", () => {
      // Tests appendQueryParam when existingVal is already an array
      expect(
        path.partialTest("/users?offset=1&offset=2&offset=3&limits=1"),
      ).toStrictEqual({
        offset: ["1", "2", "3"],
      });
    });

    it("should partial match without query params", () => {
      expect(path.partialTest("/users")).toStrictEqual({});
    });

    it("should reject unexpected query parameters", () => {
      expect(path.test("/users?offset=31&order=asc")).toBeNull();
      expect(path.test("/users?offset=31&limit=10&order=asc")).toBeNull();
    });
  });

  describe("building query parameters", () => {
    const path = new Path("/users?offset&limit", {
      queryParams: { booleanFormat: "string" },
    });

    it("should build with query parameters", () => {
      expect(path.build({ offset: 31, limit: "15 15" })).toBe(
        "/users?offset=31&limit=15%2015",
      );
    });

    it("should build with partial query parameters", () => {
      expect(path.build({ offset: 31 })).toBe("/users?offset=31");
    });

    it("should build with empty string value", () => {
      expect(path.build({ offset: 31, limit: "" })).toBe(
        "/users?offset=31&limit=",
      );
    });

    it("should skip undefined values", () => {
      expect(path.build({ offset: 31, limit: undefined })).toBe(
        "/users?offset=31",
      );
    });

    it("should build with boolean values", () => {
      expect(path.build({ offset: 31, limit: false })).toBe(
        "/users?offset=31&limit=false",
      );
      expect(path.build({ offset: 31, limit: true })).toBe(
        "/users?offset=31&limit=true",
      );
    });

    it("should build with array values", () => {
      expect(path.build({ offset: [31, 30], limit: false })).toBe(
        "/users?offset=31&offset=30&limit=false",
      );
    });

    it("should ignore search when building", () => {
      expect(
        path.build({ offset: 31, limit: 15 }, { ignoreSearch: true }),
      ).toBe("/users");
    });
  });

  describe("square brackets format", () => {
    const path = new Path("/users?offset&limit", {
      queryParams: { arrayFormat: "brackets" },
    });

    it("should build with square brackets", () => {
      expect(path.build({ offset: 31, limit: ["15"] })).toBe(
        "/users?offset=31&limit[]=15",
      );
      expect(path.build({ offset: 31, limit: ["15", "16"] })).toBe(
        "/users?offset=31&limit[]=15&limit[]=16",
      );
    });

    it("should match square brackets format", () => {
      expect(path.test("/users?offset=31&limit[]=15")).toStrictEqual({
        offset: "31",
        limit: ["15"],
      });
      expect(path.test("/users?offset=31&limit[]=15&limit[]=16")).toStrictEqual(
        {
          offset: "31",
          limit: ["15", "16"],
        },
      );
    });
  });

  describe("combined URL and query parameters", () => {
    const path = new Path("/users/profile/:id-:id2?:id3");

    it("should detect query params", () => {
      expect(path.hasQueryParams).toBe(true);
    });

    it("should match combined parameters", () => {
      expect(path.test("/users/profile/123-456?id3=789")).toStrictEqual({
        id: "123",
        id2: "456",
        id3: "789",
      });
    });

    it("should partial match without query params", () => {
      expect(path.partialTest("/users/profile/123-456")).toStrictEqual({
        id: "123",
        id2: "456",
      });
    });

    it("should match with extra query params", () => {
      expect(path.test("/users/details/123-456")).toBeDefined();
      expect(path.test("/users/profile/123-456?id3=789&id4=000")).toBeDefined();
    });

    it("should build combined parameters", () => {
      expect(path.build({ id: "123", id2: "456", id3: "789" })).toBe(
        "/users/profile/123-456?id3=789",
      );
    });
  });

  describe("overlapping URL and query parameter names", () => {
    // Tests appendQueryParam when param already exists (from URL param)
    const path = new Path("/users/:id?id");

    it("should accumulate URL and query param with same name", () => {
      // URL param 'id' = 'url123', then query param 'id' = 'query456'
      // Combined into array: [urlValue, queryValue]
      expect(path.partialTest("/users/url123?id=query456")).toStrictEqual({
        id: ["url123", "query456"],
      });
    });

    it("should accumulate URL and multiple query params with same name", () => {
      // URL param 'id' = 'url123', query params already combined by search-params
      // Result: [urlValue, [queryValue1, queryValue2]]
      expect(
        path.partialTest("/users/url123?id=query1&id=query2"),
      ).toStrictEqual({
        id: ["url123", ["query1", "query2"]],
      });
    });
  });
});
