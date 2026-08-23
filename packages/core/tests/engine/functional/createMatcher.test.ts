import { describe, expect, it } from "vitest";

import { createMatcher, createRouteTree } from "../../../src/engine";

import type { Matcher } from "../../../src/engine";

describe("createMatcher", () => {
  it("should create a matcher with no options", () => {
    const matcher: Matcher = createMatcher();

    expect(matcher).toBeDefined();
    expect(typeof matcher.match).toBe("function");
    expect(typeof matcher.buildPath).toBe("function");
    expect(typeof matcher.hasRoute).toBe("function");
  });

  it("coerces a non-string urlParamsEncoding ONCE, and stores the key (#1811 / #1839)", () => {
    // This guard belongs to the ENGINE's boundary, and after #1839 nothing
    // on the ROUTER path reaches it: `createRouter` coerces the option once, at
    // construction, and hands the matcher a string. `createMatcher` is NOT on
    // core's `exports` map (`.` / `./types` / `./api` / `./validation`) — it is
    // monorepo-internal — so in-repo tests are its only remaining callers, and
    // this is the only one that hands it a non-string. What is at stake is the
    // engine's own rule (`src/engine/CLAUDE.md`): "a guard that admits by a
    // computed key must hand the KEY downstream, never the value it computed it
    // from."
    //
    // The input DRIFTS deliberately, and that is the entire discriminating power
    // of this cell. With a STABLE `toString` the explicit coercion can be deleted
    // outright and the whole suite stays green: `hasOwn(table, obj)` and
    // `table[obj]` each run ToPropertyKey, so the implicit coercion reproduces
    // the explicit one byte for byte. Only a drifting value separates them — the
    // explicit form reads ONCE and every site then sees "none", while without it
    // the value is re-read per site, admitted as one encoding and used as
    // another, which is #1811 verbatim.
    let reads = 0;
    const tree = createRouteTree("x", "/x/:v", []);
    const matcher = createMatcher({
      urlParamsEncoding: {
        toString: () => (reads++ === 0 ? "none" : "bogusTypo"),
      } as never,
    });

    matcher.registerTree(tree);

    // ONE read for the whole registration — the encoders resolve eagerly there,
    // so a value re-read per site would already have drifted by now.
    expect(reads).toBe(1);

    // Coerced to "none": the space is printed raw rather than percent-encoded.
    expect(matcher.buildPath("x", { v: "a b" })).toBe("/x/a b");
    expect(reads).toBe(1);

    // CONTROL — a non-string that coerces to nothing the table knows falls back
    // to "default", which DOES percent-encode. This half pins the FALLBACK, not
    // the coercion: a plain `"bogusTypo"` string produces the identical result,
    // so the object wrapper buys nothing here. It reds when the table's
    // `: "default"` arm is removed.
    const fallback = createMatcher({
      urlParamsEncoding: { toString: () => "bogusTypo" } as never,
    });

    fallback.registerTree(createRouteTree("y", "/y/:v", []));

    expect(fallback.buildPath("y", { v: "a b" })).toBe("/y/a%20b");
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
        pathPattern: "",
      },
      paramTypeMap: {},
    });

    // Verify query string parsing with booleanFormat: "auto"
    const result = matcher.match("/search?q=hello&active=true");

    expect(result).toBeDefined();
    expect(result?.search.q).toBe("hello");
    expect(result?.search.active).toBe(true); // booleanFormat: "auto" parses "true" → true
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
      undefined,
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
        pathPattern: "",
      },
      paramTypeMap: {},
    });

    const result = matcher.match("/search?page=3&limit=20");

    expect(result).toBeDefined();
    expect(result?.search.page).toBe(3); // numberFormat: "auto" parses "3" → 3
    expect(result?.search.limit).toBe(20);
  });
});

describe("createMatcher — legal '?' inside a query value (#1292)", () => {
  it("keeps a '?' in a query value (loose) — the seam must not split twice", () => {
    const tree = createRouteTree("", "", [{ name: "r", path: "/r?x" }]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    // "?" is legal inside a query value per RFC 3986; SegmentMatcher already split
    // the URL at the first "?", so the DI parser must not split again (#1292).
    expect(matcher.match("/r?x=a?b")?.search).toStrictEqual({ x: "a?b" });
    // control — no inner "?"
    expect(matcher.match("/r?x=ab")?.search).toStrictEqual({ x: "ab" });
  });

  it("does not unmatch a legal '?'-in-value URL under strictQueryParams (#1292)", () => {
    const tree = createRouteTree("", "", [{ name: "s", path: "/s?q" }]);
    const matcher = createMatcher({ strictQueryParams: true });

    matcher.registerTree(tree);

    // the second split spawned a phantom undeclared key → strict rejected the whole
    // URL; the declared "q" must carry the full "a?b" value.
    expect(matcher.match("/s?q=a?b")?.search).toStrictEqual({ q: "a?b" });
    // control
    expect(matcher.match("/s?q=ab")?.search).toStrictEqual({ q: "ab" });
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
    expect(Object.hasOwn(result!.search, "__proto__")).toBe(true);
  });
});

describe("build agrees with a splat that has a more-specific child (#1568)", () => {
  // INVARIANTS Matching #24: when a splat node has a child route, a remainder
  // that matches the child resolves to the CHILD — the splat captures nothing.
  // buildPath must therefore emit no value for it, or it prints a URL that
  // falls back to the wildcard (or matches nothing at all).
  const tree = createRouteTree("", "", [
    {
      name: "n",
      path: "/n",
      children: [
        {
          name: "all",
          path: "/*rest",
          children: [{ name: "edit", path: "/edit" }],
        },
      ],
    },
  ]);

  const build = (): Matcher => {
    const matcher = createMatcher();

    matcher.registerTree(tree);

    return matcher;
  };

  it("builds the child without demanding the splat it can never bind", () => {
    expect(build().buildPath("n.all.edit", {})).toBe("/n/edit");
  });

  it("round-trips the child back to itself", () => {
    const matcher = build();
    const path = matcher.buildPath("n.all.edit", {});

    expect(matcher.match(path)?.segments.at(-1)?.fullName).toBe("n.all.edit");
  });

  it("still binds the splat where it IS the last segment", () => {
    const matcher = build();
    const path = matcher.buildPath("n.all", { rest: "x/y" });

    expect(path).toBe("/n/x/y");
    expect(matcher.match(path)?.segments.at(-1)?.fullName).toBe("n.all");
    expect(matcher.match(path)?.params.rest).toBe("x/y");
  });

  it("builds a route whose own path continues past a splat", () => {
    const own = createRouteTree("", "", [{ name: "x", path: "/a/*rest/b" }]);
    const matcher = createMatcher();

    matcher.registerTree(own);

    const path = matcher.buildPath("x", {});

    expect(path).toBe("/a/b");
    expect(matcher.match(path)?.segments.at(-1)?.fullName).toBe("x");
  });

  it("binds only the LAST splat when a path carries two", () => {
    const two = createRouteTree("", "", [{ name: "t", path: "/a/*x/*y" }]);
    const matcher = createMatcher();

    matcher.registerTree(two);

    const path = matcher.buildPath("t", { y: "1/2" });

    expect(path).toBe("/a/1/2");
    expect(matcher.match(path)?.params).toStrictEqual({ y: "1/2" });
  });
});
