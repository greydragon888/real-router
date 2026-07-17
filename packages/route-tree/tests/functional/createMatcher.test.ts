import { describe, expect, it } from "vitest";

import { createMatcher, createRouteTree } from "route-tree";

import type { Matcher } from "route-tree";

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
        booleanFormat: "auto",
        arrayFormat: "brackets",
        nullFormat: "hidden",
        numberFormat: "auto",
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

  it("should forward caseSensitive:false to the matcher (case-insensitive lookup)", () => {
    // SegmentMatcher defaults to caseSensitive:true. createMatcher must forward
    // an explicit caseSensitive:false so an upper-cased URL still matches a
    // lower-cased route. If the option were dropped, matching would fall back to
    // the case-sensitive default and "/USERS" would not match "/users".
    const tree = createRouteTree("", "", [{ name: "users", path: "/users" }]);
    const matcher = createMatcher({ caseSensitive: false });

    matcher.registerTree(tree);

    const result = matcher.match("/USERS");

    expect(result).toBeDefined();
    expect(result?.segments.at(-1)?.name).toBe("users");
  });

  it("should inject parseQueryString from search-params", () => {
    const matcher = createMatcher({
      queryParams: { booleanFormat: "auto" },
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
    });

    // Verify query string parsing with booleanFormat: "auto"
    const result = matcher.match("/search?q=hello&active=true");

    expect(result).toBeDefined();
    expect(result?.params.q).toBe("hello");
    expect(result?.params.active).toBe(true); // booleanFormat: "auto" parses "true" → true
  });

  it("should inject buildQueryString from search-params", () => {
    const matcher = createMatcher({
      queryParams: { booleanFormat: "auto" },
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
    expect(path).toContain("active=true"); // booleanFormat: "auto" serializes true → "true"
  });

  it("should parse numbers with numberFormat auto", () => {
    const matcher = createMatcher({
      queryParams: { numberFormat: "auto" },
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
            path: "/search?page&limit",
            fullName: "search",
            absolute: false,
            children: new Map(),
            nonAbsoluteChildren: [],
            paramMeta: {
              urlParams: [],
              queryParams: ["page", "limit"],
              spatParams: [],
              paramTypeMap: { page: "query", limit: "query" },
              constraintPatterns: new Map(),
              pathPattern: "/search",
            },
            paramTypeMap: { page: "query", limit: "query" },
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
    });

    const result = matcher.match("/search?page=3&limit=20");

    expect(result).toBeDefined();
    expect(result?.params.page).toBe(3); // numberFormat: "auto" parses "3" → 3
    expect(result?.params.limit).toBe(20);
  });
});

describe("createMatcher — legal '?' inside a query value (#1292)", () => {
  it("keeps a '?' in a query value (loose) — the seam must not split twice", () => {
    const tree = createRouteTree("", "", [{ name: "r", path: "/r?x" }]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    // "?" is legal inside a query value per RFC 3986; SegmentMatcher already split
    // the URL at the first "?", so the DI parser must not split again (#1292).
    expect(matcher.match("/r?x=a?b")?.params).toStrictEqual({ x: "a?b" });
    // control — no inner "?"
    expect(matcher.match("/r?x=ab")?.params).toStrictEqual({ x: "ab" });
  });

  it("does not unmatch a legal '?'-in-value URL under strictQueryParams (#1292)", () => {
    const tree = createRouteTree("", "", [{ name: "s", path: "/s?q" }]);
    const matcher = createMatcher({ strictQueryParams: true });

    matcher.registerTree(tree);

    // the second split spawned a phantom undeclared key → strict rejected the whole
    // URL; the declared "q" must carry the full "a?b" value.
    expect(matcher.match("/s?q=a?b")?.params).toStrictEqual({ q: "a?b" });
    // control
    expect(matcher.match("/s?q=ab")?.params).toStrictEqual({ q: "ab" });
  });
});

describe("createMatcher — a literal '__proto__' query key survives (#1293)", () => {
  it("keeps '__proto__' from search-params as an own param end-to-end", () => {
    const tree = createRouteTree("", "", [{ name: "r", path: "/r?x" }]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    // search-params materializes __proto__ as a real own key (#855); the matcher's
    // #mergeQueryParams must fold it in with defineProperty, not a plain assign that
    // hits the inherited setter and drops it (#1293).
    const result = matcher.match("/r?__proto__=zzz");

    expect(result).toBeDefined();
    expect(Object.hasOwn(result!.params, "__proto__")).toBe(true);
  });
});
