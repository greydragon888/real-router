import { describe, expect, it } from "vitest";

import { createMatcher } from "../../src/createMatcher";

import type { Matcher } from "../../src/createMatcher";

describe("createMatcher", () => {
  it("should create a matcher with no options", () => {
    const matcher: Matcher = createMatcher();

    expect(matcher).toBeDefined();
    expect(typeof matcher.match).toBe("function");
    expect(typeof matcher.buildPath).toBe("function");
    expect(typeof matcher.hasRoute).toBe("function");
  });

  it("should create a matcher with all options", () => {
    const matcher = createMatcher({
      caseSensitive: false,
      strictTrailingSlash: true,
      strictQueryParams: true,
      urlParamsEncoding: "uri",
      queryParams: {
        booleanFormat: "string",
        arrayFormat: "brackets",
        nullFormat: "hidden",
      },
    });

    expect(matcher).toBeDefined();
  });

  it("should create a matcher with partial options", () => {
    const matcher = createMatcher({
      strictTrailingSlash: true,
    });

    expect(matcher).toBeDefined();
  });

  it("should inject parseQueryString from search-params", () => {
    const matcher = createMatcher({
      queryParams: { booleanFormat: "string" },
    });

    matcher.registerTree({
      name: "@@router-root@@",
      path: "",
      fullName: "",
      absolute: false,
      children: new Map([
        [
          "search",
          {
            name: "search",
            path: "/search?q&active",
            fullName: "search",
            absolute: false,
            children: new Map(),
            nonAbsoluteChildren: [],
            paramMeta: {
              urlParams: [],
              queryParams: ["q", "active"],
              spatParams: [],
              paramTypeMap: { q: "query", active: "query" },
              constraintPatterns: new Map(),
              pathPattern: "/search",
            },
            paramTypeMap: { q: "query", active: "query" },
            staticPath: "/search",
          },
        ],
      ]),
      nonAbsoluteChildren: [],
      paramMeta: {
        urlParams: [],
        queryParams: [],
        spatParams: [],
        paramTypeMap: {},
        constraintPatterns: new Map(),
        pathPattern: "",
      },
      paramTypeMap: {},
      staticPath: null,
    });

    // Verify query string parsing with booleanFormat: "string"
    const result = matcher.match("/search?q=hello&active=true");

    expect(result).toBeDefined();
    expect(result?.params.q).toBe("hello");
    expect(result?.params.active).toBe(true); // booleanFormat: "string" parses "true" → true
  });

  it("should inject buildQueryString from search-params", () => {
    const matcher = createMatcher({
      queryParams: { booleanFormat: "string" },
    });

    matcher.registerTree({
      name: "@@router-root@@",
      path: "",
      fullName: "",
      absolute: false,
      children: new Map([
        [
          "search",
          {
            name: "search",
            path: "/search?q&active",
            fullName: "search",
            absolute: false,
            children: new Map(),
            nonAbsoluteChildren: [],
            paramMeta: {
              urlParams: [],
              queryParams: ["q", "active"],
              spatParams: [],
              paramTypeMap: { q: "query", active: "query" },
              constraintPatterns: new Map(),
              pathPattern: "/search",
            },
            paramTypeMap: { q: "query", active: "query" },
            staticPath: "/search",
          },
        ],
      ]),
      nonAbsoluteChildren: [],
      paramMeta: {
        urlParams: [],
        queryParams: [],
        spatParams: [],
        paramTypeMap: {},
        constraintPatterns: new Map(),
        pathPattern: "",
      },
      paramTypeMap: {},
      staticPath: null,
    });

    // buildPath with queryParamsMode "loose" to include query params
    const path = matcher.buildPath(
      "search",
      {
        q: "hello",
        active: true,
      },
      { queryParamsMode: "loose" },
    );

    expect(path).toContain("/search");
    expect(path).toContain("q=hello");
    expect(path).toContain("active=true"); // booleanFormat: "string" serializes true → "true"
  });
});
