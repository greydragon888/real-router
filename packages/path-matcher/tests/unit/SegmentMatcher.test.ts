import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../src/buildParamMeta";
import {
  createSegmentNode,
  defaultBuildQueryString,
  defaultParseQueryString,
  SegmentMatcher,
} from "../../src/SegmentMatcher";

import type {
  BuildParamSlot,
  CompiledRoute,
  MatcherInputNode,
  MatchResult,
  SegmentMatcherOptions,
} from "../../src/types";

function createInputNode(
  overrides: Partial<MatcherInputNode> & { name: string; path: string },
): MatcherInputNode {
  const paramMeta = buildParamMeta(overrides.path);

  return {
    fullName: overrides.name,
    absolute: false,
    children: new Map<string, MatcherInputNode>(),
    nonAbsoluteChildren: [],
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    staticPath: paramMeta.urlParams.length === 0 ? overrides.path : null,
    ...overrides,
  };
}

// =============================================================================
// Default DI Functions
// =============================================================================

describe("defaultParseQueryString", () => {
  it("should return empty object for empty string", () => {
    expect(defaultParseQueryString("")).toStrictEqual({});
  });

  it("should parse key=value pairs", () => {
    expect(defaultParseQueryString("a=1&b=2")).toStrictEqual({
      a: "1",
      b: "2",
    });
  });

  it("should handle keys without values", () => {
    expect(defaultParseQueryString("flag")).toStrictEqual({ flag: "" });
  });

  it("should handle mixed keys with and without values", () => {
    expect(defaultParseQueryString("a=1&flag&b=2")).toStrictEqual({
      a: "1",
      flag: "",
      b: "2",
    });
  });
});

describe("defaultBuildQueryString", () => {
  it("should return empty string for empty object", () => {
    expect(defaultBuildQueryString({})).toBe("");
  });

  it("should build key=value pairs", () => {
    expect(defaultBuildQueryString({ a: "1", b: "2" })).toBe("a=1&b=2");
  });

  it("should omit value for empty string values", () => {
    expect(defaultBuildQueryString({ flag: "" })).toBe("flag");
  });

  it("should handle mixed values", () => {
    expect(defaultBuildQueryString({ a: "1", flag: "", b: "2" })).toBe(
      "a=1&flag&b=2",
    );
  });
});

// =============================================================================
// Type Compilation Tests
// =============================================================================

describe("type compilation", () => {
  it("should compile MatcherInputNode interface", () => {
    const node: MatcherInputNode = createInputNode({
      name: "home",
      path: "/",
    });

    expect(node.name).toBe("home");
    expect(node.path).toBe("/");
    expect(node.fullName).toBe("home");
    expect(node.absolute).toBe(false);
    expect(node.children).toBeInstanceOf(Map);
    expect(node.nonAbsoluteChildren).toStrictEqual([]);
    expect(node.paramMeta).toBeDefined();
    expect(node.paramTypeMap).toStrictEqual({});
    expect(node.staticPath).toBe("/");
  });

  it("should compile CompiledRoute interface", () => {
    const route: CompiledRoute = {
      name: "home",
      parent: null,
      depth: 0,
      matchSegments: [],
      meta: {},
      declaredQueryParams: [],
      declaredQueryParamsSet: new Set(),
      hasTrailingSlash: false,
      constraintPatterns: new Map(),
      hasConstraints: false,
      buildStaticParts: ["/"],
      buildParamSlots: [],
      buildSegments: [],
    };

    expect(route.name).toBe("home");
    expect(route.parent).toBeNull();
    expect(route.depth).toBe(0);
  });

  it("should compile BuildParamSlot interface", () => {
    const slot: BuildParamSlot = {
      paramName: "id",
      isOptional: false,
    };

    expect(slot.paramName).toBe("id");
    expect(slot.isOptional).toBe(false);
    expect(slot.encoder).toBeUndefined();
  });

  it("should compile MatchResult interface", () => {
    const result: MatchResult = {
      segments: [],
      buildSegments: [],
      params: {},
      meta: {},
    };

    expect(result.segments).toStrictEqual([]);
    expect(result.params).toStrictEqual({});
  });

  it("should compile SegmentMatcherOptions interface", () => {
    const options: SegmentMatcherOptions = {
      caseSensitive: true,
      strictTrailingSlash: false,
      strictQueryParams: false,
      urlParamsEncoding: "default",
    };

    expect(options.caseSensitive).toBe(true);
  });
});

// =============================================================================
// SegmentNode Factory
// =============================================================================

describe("createSegmentNode", () => {
  it("should create node with all properties initialized", () => {
    const node = createSegmentNode();

    expect(node).toHaveProperty("staticChildren");
    expect(node).toHaveProperty("paramChild");
    expect(node).toHaveProperty("paramName");
    expect(node).toHaveProperty("splatChild");
    expect(node).toHaveProperty("splatName");
    expect(node).toHaveProperty("route");
    expect(node).toHaveProperty("slashChildRoute");
  });

  it("should initialize optional properties to undefined", () => {
    const node = createSegmentNode();

    expect(node.paramChild).toBeUndefined();
    expect(node.paramName).toBeUndefined();
    expect(node.splatChild).toBeUndefined();
    expect(node.splatName).toBeUndefined();
    expect(node.route).toBeUndefined();
    expect(node.slashChildRoute).toBeUndefined();
  });

  it("should use Object.create(null) for staticChildren", () => {
    const node = createSegmentNode();

    // Object.create(null) has no prototype
    expect(Object.getPrototypeOf(node.staticChildren)).toBeNull();
  });

  it("should create independent instances", () => {
    const node1 = createSegmentNode();
    const node2 = createSegmentNode();

    expect(node1).not.toBe(node2);
    expect(node1.staticChildren).not.toBe(node2.staticChildren);
  });

  it("should have uniform hidden class shape (all keys present)", () => {
    const node = createSegmentNode();
    const keys = Object.keys(node);

    expect(keys).toStrictEqual([
      "staticChildren",
      "paramChild",
      "paramName",
      "splatChild",
      "splatName",
      "route",
      "slashChildRoute",
    ]);
  });
});

// =============================================================================
// SegmentMatcher Constructor
// =============================================================================

describe("SegmentMatcher", () => {
  describe("constructor", () => {
    it("should resolve default options", () => {
      const matcher = new SegmentMatcher();

      expect(matcher.options.caseSensitive).toBe(true);
      expect(matcher.options.strictTrailingSlash).toBe(false);
      expect(matcher.options.strictQueryParams).toBe(false);
      expect(matcher.options.urlParamsEncoding).toBe("default");
      expect(matcher.options.parseQueryString).toBeTypeOf("function");
      expect(matcher.options.buildQueryString).toBeTypeOf("function");
    });

    it("should resolve empty options to defaults", () => {
      const matcher = new SegmentMatcher({});

      expect(matcher.options.caseSensitive).toBe(true);
      expect(matcher.options.strictTrailingSlash).toBe(false);
    });

    it("should accept custom options", () => {
      const matcher = new SegmentMatcher({
        caseSensitive: false,
        strictTrailingSlash: true,
        strictQueryParams: true,
        urlParamsEncoding: "none",
      });

      expect(matcher.options.caseSensitive).toBe(false);
      expect(matcher.options.strictTrailingSlash).toBe(true);
      expect(matcher.options.strictQueryParams).toBe(true);
      expect(matcher.options.urlParamsEncoding).toBe("none");
    });

    it("should accept DI functions", () => {
      const parseQueryString = (qs: string): Record<string, unknown> => ({
        raw: qs,
      });
      const buildQueryString = (params: Record<string, unknown>): string =>
        JSON.stringify(params);

      const matcher = new SegmentMatcher({
        parseQueryString,
        buildQueryString,
      });

      expect(matcher.options.parseQueryString).toBe(parseQueryString);
      expect(matcher.options.buildQueryString).toBe(buildQueryString);
    });
  });

  // ===========================================================================
  // registerTree
  // ===========================================================================

  describe("registerTree", () => {
    it("should register single static route", () => {
      const matcher = new SegmentMatcher();
      const node = createInputNode({ name: "home", path: "/" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("home")).toBe(true);
    });

    it("should return false for unregistered route", () => {
      const matcher = new SegmentMatcher();

      expect(matcher.hasRoute("nonexistent")).toBe(false);
    });

    it("should register route with path segments", () => {
      const matcher = new SegmentMatcher();
      const node = createInputNode({ name: "users", path: "/users" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("users")).toBe(true);
    });

    it("should register nested routes via children", () => {
      const matcher = new SegmentMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      matcher.registerTree(usersNode);

      expect(matcher.hasRoute("users")).toBe(true);
      expect(matcher.hasRoute("users.profile")).toBe(true);
    });

    it("should register deeply nested routes", () => {
      const matcher = new SegmentMatcher();

      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "users.profile.settings",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      matcher.registerTree(usersNode);

      expect(matcher.hasRoute("users")).toBe(true);
      expect(matcher.hasRoute("users.profile")).toBe(true);
      expect(matcher.hasRoute("users.profile.settings")).toBe(true);
    });
  });

  // ===========================================================================
  // Static Route Matching
  // ===========================================================================

  describe("match — static routes", () => {
    function createStaticMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const contactNode = createInputNode({
        name: "contact",
        path: "/contact",
        fullName: "contact",
      });
      const homeNode = createInputNode({
        name: "home",
        path: "/",
        fullName: "home",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([
          ["home", homeNode],
          ["about", aboutNode],
          ["contact", contactNode],
        ]),
        nonAbsoluteChildren: [homeNode, aboutNode, contactNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match static route", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(1);
      expect(result!.segments[0].fullName).toBe("about");
      expect(result!.params).toStrictEqual({});
    });

    it("should match root path /", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("home");
      expect(result!.params).toStrictEqual({});
    });

    it("should return undefined for unknown path", () => {
      const matcher = createStaticMatcher();

      expect(matcher.match("/unknown")).toBeUndefined();
    });

    it("should return undefined for path not starting with /", () => {
      const matcher = createStaticMatcher();

      expect(matcher.match("about")).toBeUndefined();
    });

    it("should normalize empty path to /", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("home");
    });

    it("should strip hash fragment", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about#section");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should normalize double slashes", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about//");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should normalize multiple consecutive slashes", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("///about");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should reject raw unicode in path", () => {
      const matcher = createStaticMatcher();

      expect(matcher.match("/привет")).toBeUndefined();
    });

    it("should strip trailing slash (non-strict mode)", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about/");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should handle query string in path (ignore for now)", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about?key=value");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should return correct meta", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({ about: {} });
    });

    it("should return correct buildSegments", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about");

      expect(result).toBeDefined();
      expect(result!.buildSegments).toHaveLength(1);
      expect(result!.buildSegments[0].fullName).toBe("about");
    });

    it("should handle case-sensitive matching (default)", () => {
      const matcher = createStaticMatcher();

      expect(matcher.match("/About")).toBeUndefined();
      expect(matcher.match("/ABOUT")).toBeUndefined();
    });

    it("should handle case-insensitive matching", () => {
      const matcher = new SegmentMatcher({ caseSensitive: false });
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/About");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
    });

    it("should handle hash-only path after stripping", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/#");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("home");
    });

    it("should match nested static routes", () => {
      const matcher = new SegmentMatcher();
      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "about.settings",
      });
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/about/settings");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("about");
      expect(result!.segments[1].fullName).toBe("about.settings");
      expect(result!.params).toStrictEqual({});
    });

    it("should register route with query params in path", () => {
      const matcher = new SegmentMatcher();
      const searchNode = createInputNode({
        name: "search",
        path: "/search?q&page",
        fullName: "search",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/search");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("search");
    });

    it("should register route with trailing slash in path", () => {
      const matcher = new SegmentMatcher();
      const trailingNode = createInputNode({
        name: "trailing",
        path: "/trailing/",
        fullName: "trailing",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["trailing", trailingNode]]),
        nonAbsoluteChildren: [trailingNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/trailing");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("trailing");
    });

    it("should handle child with empty path (slash-child)", () => {
      const matcher = new SegmentMatcher();
      const listNode = createInputNode({
        name: "list",
        path: "",
        fullName: "users.list",
      });
      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.hasRoute("users")).toBe(true);
      expect(matcher.hasRoute("users.list")).toBe(true);
    });

    it("should register route with param constraint", () => {
      const matcher = new SegmentMatcher();
      const userNode = createInputNode({
        name: "user",
        path: String.raw`/users/:id<\d+>`,
        fullName: "user",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["user", userNode]]),
        nonAbsoluteChildren: [userNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.hasRoute("user")).toBe(true);
    });

    it("should return nested meta with all segments", () => {
      const matcher = new SegmentMatcher();
      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "about.settings",
      });
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/about/settings");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        about: {},
        "about.settings": {},
      });
    });
  });

  // ===========================================================================
  // buildPath — static routes
  // ===========================================================================

  describe("buildPath — static routes", () => {
    function createStaticMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const homeNode = createInputNode({
        name: "home",
        path: "/",
        fullName: "home",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([
          ["home", homeNode],
          ["about", aboutNode],
        ]),
        nonAbsoluteChildren: [homeNode, aboutNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should build static path", () => {
      const matcher = createStaticMatcher();

      expect(matcher.buildPath("about")).toBe("/about");
    });

    it("should build root path", () => {
      const matcher = createStaticMatcher();

      expect(matcher.buildPath("home")).toBe("/");
    });

    it("should throw for unknown route", () => {
      const matcher = createStaticMatcher();

      expect(() => matcher.buildPath("unknown")).toThrowError(
        "Route not found: unknown",
      );
    });

    it("should prepend rootPath", () => {
      const matcher = createStaticMatcher();

      matcher.setRootPath("/app");

      expect(matcher.buildPath("about")).toBe("/app/about");
    });

    it("should build nested static path", () => {
      const matcher = new SegmentMatcher();
      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "about.settings",
      });
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("about.settings")).toBe("/about/settings");
    });
  });

  // ===========================================================================
  // getSegmentsByName
  // ===========================================================================

  describe("getSegmentsByName", () => {
    it("should return segments for registered route", () => {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const segments = matcher.getSegmentsByName("about");

      expect(segments).toBeDefined();
      expect(segments).toHaveLength(1);
      expect(segments![0].fullName).toBe("about");
    });

    it("should return undefined for unregistered route", () => {
      const matcher = new SegmentMatcher();

      expect(matcher.getSegmentsByName("unknown")).toBeUndefined();
    });

    it("should return frozen segments array", () => {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const segments = matcher.getSegmentsByName("about");

      expect(Object.isFrozen(segments)).toBe(true);
    });

    it("should return nested segments chain", () => {
      const matcher = new SegmentMatcher();
      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "about.settings",
      });
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const segments = matcher.getSegmentsByName("about.settings");

      expect(segments).toHaveLength(2);
      expect(segments![0].fullName).toBe("about");
      expect(segments![1].fullName).toBe("about.settings");
    });
  });

  // ===========================================================================
  // getMetaByName
  // ===========================================================================

  describe("getMetaByName", () => {
    it("should return undefined for unregistered route", () => {
      const matcher = new SegmentMatcher();

      expect(matcher.getMetaByName("home")).toBeUndefined();
    });

    it("should return meta for registered route", () => {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const meta = matcher.getMetaByName("about");

      expect(meta).toStrictEqual({ about: {} });
    });

    it("should return frozen meta object", () => {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);

      const meta = matcher.getMetaByName("about");

      expect(Object.isFrozen(meta)).toBe(true);
    });
  });

  // ===========================================================================
  // setRootPath
  // ===========================================================================

  describe("setRootPath", () => {
    it("should accept root path string", () => {
      const matcher = new SegmentMatcher();

      expect(() => {
        matcher.setRootPath("/app");
      }).not.toThrowError();
    });

    it("should affect buildPath output", () => {
      const matcher = new SegmentMatcher();
      const aboutNode = createInputNode({
        name: "about",
        path: "/about",
        fullName: "about",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["about", aboutNode]]),
        nonAbsoluteChildren: [aboutNode],
      });

      matcher.registerTree(rootNode);
      matcher.setRootPath("/app");

      expect(matcher.buildPath("about")).toBe("/app/about");
    });
  });

  // ===========================================================================
  // hasRoute
  // ===========================================================================

  describe("hasRoute", () => {
    it("should return true for registered route", () => {
      const matcher = new SegmentMatcher();
      const node = createInputNode({ name: "home", path: "/" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("home")).toBe(true);
    });

    it("should return false for unregistered route", () => {
      const matcher = new SegmentMatcher();

      expect(matcher.hasRoute("anything")).toBe(false);
    });

    it("should use fullName for lookup", () => {
      const matcher = new SegmentMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      matcher.registerTree(usersNode);

      // Should find by fullName, not by segment name
      expect(matcher.hasRoute("users.profile")).toBe(true);
      expect(matcher.hasRoute("profile")).toBe(false);
    });
  });

  // ===========================================================================
  // Param Route Matching
  // ===========================================================================

  describe("match — param routes", () => {
    function createParamMatcher(
      options?: SegmentMatcherOptions,
    ): SegmentMatcher {
      const matcher = new SegmentMatcher(options);

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const homeNode = createInputNode({
        name: "home",
        path: "/",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([
          ["home", homeNode],
          ["users", usersNode],
        ]),
        nonAbsoluteChildren: [homeNode, usersNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match param route and extract param", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.segments[1].fullName).toBe("users.profile");
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should extract string param values", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/john");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "john" });
    });

    it("should decode percent-encoded param values", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/hello%20world");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "hello world" });
    });

    it("should return undefined for malformed percent encoding", () => {
      const matcher = createParamMatcher();

      expect(matcher.match("/users/hello%ZZworld")).toBeUndefined();
    });

    it("should return undefined for truncated percent encoding", () => {
      const matcher = createParamMatcher();

      expect(matcher.match("/users/hello%2")).toBeUndefined();
    });

    it("should return undefined for percent at end of string", () => {
      const matcher = createParamMatcher();

      expect(matcher.match("/users/hello%")).toBeUndefined();
    });

    it("should skip decoding when urlParamsEncoding is none", () => {
      const matcher = createParamMatcher({ urlParamsEncoding: "none" });

      const result = matcher.match("/users/hello%20world");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "hello%20world" });
    });

    it("should preserve original case for param values", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/JohnDoe");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "JohnDoe" });
    });

    it("should match param route with case-insensitive static segments", () => {
      const matcher = createParamMatcher({ caseSensitive: false });

      const result = matcher.match("/Users/123");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should prioritize static over param", () => {
      const matcher = new SegmentMatcher();

      const newNode = createInputNode({
        name: "new",
        path: "/new",
        fullName: "users.new",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([
          ["new", newNode],
          ["profile", profileNode],
        ]),
        nonAbsoluteChildren: [newNode, profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      // Static "new" should win over param ":id"
      const staticResult = matcher.match("/users/new");

      expect(staticResult).toBeDefined();
      expect(staticResult!.segments[1].fullName).toBe("users.new");
      expect(staticResult!.params).toStrictEqual({});

      // Non-static should fall through to param
      const paramResult = matcher.match("/users/123");

      expect(paramResult).toBeDefined();
      expect(paramResult!.segments[1].fullName).toBe("users.profile");
      expect(paramResult!.params).toStrictEqual({ id: "123" });
    });

    it("should return undefined when no param and no static match", () => {
      const matcher = new SegmentMatcher();

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      // /users/123 has no param child → undefined
      expect(matcher.match("/users/123")).toBeUndefined();
    });

    it("should match multiple params", () => {
      const matcher = new SegmentMatcher();

      const postNode = createInputNode({
        name: "post",
        path: "/:postId",
        fullName: "users.profile.post",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["post", postNode]]),
        nonAbsoluteChildren: [postNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/users/42/99");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "42", postId: "99" });
      expect(result!.segments).toHaveLength(3);
    });

    it("should strip trailing slash before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123/");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should normalize double slashes before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users//123");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should strip hash before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123#section");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should strip query string before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123?foo=bar");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should return correct meta for param routes", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        users: {},
        "users.profile": { id: "url" },
      });
    });

    it("should return correct buildSegments for param routes", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.buildSegments).toHaveLength(2);
      expect(result!.buildSegments[0].fullName).toBe("users");
      expect(result!.buildSegments[1].fullName).toBe("users.profile");
    });

    it("should handle slash-child with param parent", () => {
      const matcher = new SegmentMatcher();

      const listNode = createInputNode({
        name: "list",
        path: "",
        fullName: "users.profile.list",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      // Should fall back to slashChildRoute when paramChild has no route but has slash-child
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should handle param at root level", () => {
      const matcher = new SegmentMatcher();

      const itemNode = createInputNode({
        name: "item",
        path: "/:slug",
        fullName: "item",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["item", itemNode]]),
        nonAbsoluteChildren: [itemNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/hello");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ slug: "hello" });
    });

    it("should handle valid percent encoding with multiple sequences", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/%E4%B8%AD%E6%96%87");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "中文" });
    });

    it("should handle lowercase hex in percent encoding", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/%e4%b8%ad%e6%96%87");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "中文" });
    });

    it("should reject raw unicode in param path", () => {
      const matcher = createParamMatcher();

      expect(matcher.match("/users/中文")).toBeUndefined();
    });
  });

  // ===========================================================================
  // buildPath — param routes
  // ===========================================================================

  describe("buildPath — param routes", () => {
    function createParamBuildMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should build path with param", () => {
      const matcher = createParamBuildMatcher();

      expect(matcher.buildPath("users.profile", { id: "123" })).toBe(
        "/users/123",
      );
    });

    it("should build path with string param", () => {
      const matcher = createParamBuildMatcher();

      expect(matcher.buildPath("users.profile", { id: "john" })).toBe(
        "/users/john",
      );
    });

    it("should encode param values", () => {
      const matcher = createParamBuildMatcher();

      expect(matcher.buildPath("users.profile", { id: "hello world" })).toBe(
        "/users/hello%20world",
      );
    });

    it("should coerce numeric param to string", () => {
      const matcher = createParamBuildMatcher();

      expect(matcher.buildPath("users.profile", { id: 123 })).toBe(
        "/users/123",
      );
    });

    it("should throw for missing required param", () => {
      const matcher = createParamBuildMatcher();

      expect(() => matcher.buildPath("users.profile")).toThrowError(
        "Missing required param: id",
      );
    });

    it("should throw for explicitly undefined param", () => {
      const matcher = createParamBuildMatcher();

      expect(() =>
        matcher.buildPath("users.profile", { id: undefined }),
      ).toThrowError("Missing required param: id");
    });

    it("should throw for explicitly null param", () => {
      const matcher = createParamBuildMatcher();

      expect(() =>
        matcher.buildPath("users.profile", { id: null }),
      ).toThrowError("Missing required param: id");
    });

    it("should prepend rootPath to param path", () => {
      const matcher = createParamBuildMatcher();

      matcher.setRootPath("/app");

      expect(matcher.buildPath("users.profile", { id: "123" })).toBe(
        "/app/users/123",
      );
    });

    it("should build path with multiple params", () => {
      const matcher = new SegmentMatcher();

      const postNode = createInputNode({
        name: "post",
        path: "/:postId",
        fullName: "users.profile.post",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["post", postNode]]),
        nonAbsoluteChildren: [postNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(
        matcher.buildPath("users.profile.post", { id: "42", postId: "99" }),
      ).toBe("/users/42/99");
    });

    it("should build static route path even when params exist in tree", () => {
      const matcher = createParamBuildMatcher();

      // "users" is a static route, buildPath should use fast path
      expect(matcher.buildPath("users")).toBe("/users");
    });

    it("should build path with param between static segments", () => {
      const matcher = new SegmentMatcher();

      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "users.profile.settings",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("users.profile.settings", { id: "42" })).toBe(
        "/users/42/settings",
      );
    });

    it("should handle boolean param coercion", () => {
      const matcher = createParamBuildMatcher();

      expect(matcher.buildPath("users.profile", { id: true })).toBe(
        "/users/true",
      );
    });

    it("should encode splat param preserving / separators", () => {
      const matcher = new SegmentMatcher();

      const filesNode = createInputNode({
        name: "files",
        path: "/files/*path",
        fullName: "files",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["files", filesNode]]),
        nonAbsoluteChildren: [filesNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("files", { path: "docs/readme.md" })).toBe(
        "/files/docs/readme.md",
      );
    });

    it("should encode splat param segments individually", () => {
      const matcher = new SegmentMatcher();

      const filesNode = createInputNode({
        name: "files",
        path: "/files/*path",
        fullName: "files",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["files", filesNode]]),
        nonAbsoluteChildren: [filesNode],
      });

      matcher.registerTree(rootNode);

      expect(
        matcher.buildPath("files", { path: "my folder/my file.txt" }),
      ).toBe("/files/my%20folder/my%20file.txt");
    });

    it("should use no encoding for params when urlParamsEncoding is none", () => {
      const matcher = new SegmentMatcher({ urlParamsEncoding: "none" });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("users.profile", { id: "hello world" })).toBe(
        "/users/hello world",
      );
    });

    it("should skip optional param when value is undefined", () => {
      const matcher = new SegmentMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search/:query?",
        fullName: "search",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("search", {})).toBe("/search");
    });
  });

  // ===========================================================================
  // Nested Routes — matchSegments, meta, parent, depth
  // ===========================================================================

  describe("nested routes — hierarchical compilation", () => {
    function createNestedMatcher(): {
      matcher: SegmentMatcher;
      usersNode: MatcherInputNode;
      profileNode: MatcherInputNode;
      settingsNode: MatcherInputNode;
    } {
      const matcher = new SegmentMatcher();

      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings?theme",
        fullName: "users.profile.settings",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:userId?tab",
        fullName: "users.profile",
        children: new Map([["settings", settingsNode]]),
        nonAbsoluteChildren: [settingsNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users?page",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      return { matcher, usersNode, profileNode, settingsNode };
    }

    it("should match 3-segment nested route with full matchSegments chain", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123/settings");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(3);
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.segments[1].fullName).toBe("users.profile");
      expect(result!.segments[2].fullName).toBe("users.profile.settings");
    });

    it("should inherit params from ancestor segments", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123/settings");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ userId: "123" });
    });

    it("should build matchSegments as frozen array", () => {
      const { matcher } = createNestedMatcher();

      const segments = matcher.getSegmentsByName("users.profile.settings");

      expect(segments).toBeDefined();
      expect(Object.isFrozen(segments)).toBe(true);
    });

    it("should set buildSegments equal to matchSegments (non slash-child)", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123/settings");

      expect(result).toBeDefined();
      expect(result!.buildSegments).toStrictEqual(result!.segments);
    });

    it("should build meta with paramTypeMap for each segment", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123/settings");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        users: { page: "query" },
        "users.profile": { userId: "url", tab: "query" },
        "users.profile.settings": { theme: "query" },
      });
    });

    it("should freeze meta object", () => {
      const { matcher } = createNestedMatcher();

      const meta = matcher.getMetaByName("users.profile.settings");

      expect(meta).toBeDefined();
      expect(Object.isFrozen(meta)).toBe(true);
    });

    it("should aggregate declaredQueryParams from all ancestors", () => {
      const { matcher } = createNestedMatcher();

      const segments = matcher.getSegmentsByName("users.profile.settings");

      expect(segments).toBeDefined();

      const meta = matcher.getMetaByName("users.profile.settings");

      expect(meta).toBeDefined();
      expect(meta!.users).toHaveProperty("page", "query");
      expect(meta!["users.profile"]).toHaveProperty("tab", "query");
      expect(meta!["users.profile.settings"]).toHaveProperty("theme", "query");
    });

    it("should set parent reference on compiled route", () => {
      const { matcher } = createNestedMatcher();

      expect(matcher.hasRoute("users")).toBe(true);
      expect(matcher.hasRoute("users.profile")).toBe(true);
      expect(matcher.hasRoute("users.profile.settings")).toBe(true);

      const result = matcher.match("/users/123/settings");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(3);
    });

    it("should set correct depth on nested routes", () => {
      const { matcher } = createNestedMatcher();

      const usersSegments = matcher.getSegmentsByName("users");
      const profileSegments = matcher.getSegmentsByName("users.profile");
      const settingsSegments = matcher.getSegmentsByName(
        "users.profile.settings",
      );

      // depth = segments.length - 1: users→0, profile→1, settings→2
      expect(usersSegments).toHaveLength(1);
      expect(profileSegments).toHaveLength(2);
      expect(settingsSegments).toHaveLength(3);
    });

    it("should buildPath for nested route concatenating ancestor paths", () => {
      const { matcher } = createNestedMatcher();

      expect(
        matcher.buildPath("users.profile.settings", { userId: "123" }),
      ).toBe("/users/123/settings");
    });

    it("should buildPath for intermediate nested route", () => {
      const { matcher } = createNestedMatcher();

      expect(matcher.buildPath("users.profile", { userId: "456" })).toBe(
        "/users/456",
      );
    });

    it("should buildPath for root-level nested route", () => {
      const { matcher } = createNestedMatcher();

      expect(matcher.buildPath("users")).toBe("/users");
    });

    it("should match intermediate nested route", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.segments[1].fullName).toBe("users.profile");
      expect(result!.params).toStrictEqual({ userId: "123" });
    });

    it("should return correct meta for intermediate nested route", () => {
      const { matcher } = createNestedMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        users: { page: "query" },
        "users.profile": { userId: "url", tab: "query" },
      });
    });
  });

  // ===========================================================================
  // Slash-Child Routes
  // ===========================================================================

  describe("slash-child routes", () => {
    function createSlashChildMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();

      const listNode = createInputNode({
        name: "list",
        path: "/",
        fullName: "users.list",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([
          ["list", listNode],
          ["profile", profileNode],
        ]),
        nonAbsoluteChildren: [listNode, profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match slash-child on parent path", () => {
      const matcher = createSlashChildMatcher();

      const result = matcher.match("/users");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.segments[1].fullName).toBe("users.list");
    });

    it("should include slash-child in matchSegments but NOT in buildSegments", () => {
      const matcher = createSlashChildMatcher();

      const result = matcher.match("/users");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.buildSegments).toHaveLength(1);
      expect(result!.buildSegments[0].fullName).toBe("users");
    });

    it("should not affect sibling param routes", () => {
      const matcher = createSlashChildMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[1].fullName).toBe("users.profile");
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should buildPath for slash-child using parent path", () => {
      const matcher = createSlashChildMatcher();

      expect(matcher.buildPath("users.list")).toBe("/users");
    });

    it("should handle slash-child with empty path (path: '')", () => {
      const matcher = new SegmentMatcher();

      const listNode = createInputNode({
        name: "list",
        path: "",
        fullName: "users.list",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/users");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[1].fullName).toBe("users.list");
      expect(result!.buildSegments).toHaveLength(1);
    });

    it("should handle slash-child with parent param route", () => {
      const matcher = new SegmentMatcher();

      const listNode = createInputNode({
        name: "list",
        path: "/",
        fullName: "users.profile.list",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:type",
        fullName: "users.profile",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/users/admin");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(3);
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.segments[1].fullName).toBe("users.profile");
      expect(result!.segments[2].fullName).toBe("users.profile.list");
      expect(result!.params).toStrictEqual({ type: "admin" });
    });

    it("should return correct meta for slash-child", () => {
      const matcher = createSlashChildMatcher();

      const result = matcher.match("/users");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        users: {},
        "users.list": {},
      });
    });

    it("should not add slash-child to static cache", () => {
      const matcher = createSlashChildMatcher();

      const usersResult = matcher.match("/users");
      const usersResult2 = matcher.match("/users");

      expect(usersResult).toBeDefined();
      expect(usersResult2).toBeDefined();
      expect(usersResult!.segments[1].fullName).toBe("users.list");
      expect(usersResult2!.segments[1].fullName).toBe("users.list");
    });

    it("should prefer parent route over slash-child", () => {
      const matcher = new SegmentMatcher();

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/users");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(1);
      expect(result!.segments[0].fullName).toBe("users");
    });

    it("should buildPath for slash-child with parent params", () => {
      const matcher = new SegmentMatcher();

      const listNode = createInputNode({
        name: "list",
        path: "/",
        fullName: "users.profile.list",
      });

      const profileNode = createInputNode({
        name: "profile",
        path: "/:type",
        fullName: "users.profile",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("users.profile.list", { type: "admin" })).toBe(
        "/users/admin",
      );
    });
  });

  // ===========================================================================
  // Optional Params — match
  // ===========================================================================

  describe("match — optional params", () => {
    function createOptionalParamMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search/:query?",
        fullName: "search",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match without optional param", () => {
      const matcher = createOptionalParamMatcher();

      const result = matcher.match("/search");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("search");
      expect(result!.params).toStrictEqual({});
    });

    it("should match with optional param provided", () => {
      const matcher = createOptionalParamMatcher();

      const result = matcher.match("/search/hello");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("search");
      expect(result!.params).toStrictEqual({ query: "hello" });
    });

    it("should handle optional param in middle of path", () => {
      const matcher = new SegmentMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search/:query?/results",
        fullName: "search",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      const withParam = matcher.match("/search/test/results");

      expect(withParam).toBeDefined();
      expect(withParam!.params).toStrictEqual({ query: "test" });

      const withoutParam = matcher.match("/search/results");

      expect(withoutParam).toBeDefined();
      expect(withoutParam!.params).toStrictEqual({});
    });

    it("should handle consecutive optional params", () => {
      const matcher = new SegmentMatcher();

      const routeNode = createInputNode({
        name: "route",
        path: "/a/:b?/:c?/d",
        fullName: "route",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["route", routeNode]]),
        nonAbsoluteChildren: [routeNode],
      });

      matcher.registerTree(rootNode);

      const bothProvided = matcher.match("/a/x/y/d");

      expect(bothProvided).toBeDefined();
      expect(bothProvided!.params).toStrictEqual({ b: "x", c: "y" });

      const noneProvided = matcher.match("/a/d");

      expect(noneProvided).toBeDefined();
      expect(noneProvided!.params).toStrictEqual({});
    });

    it("should decode percent-encoded optional param", () => {
      const matcher = createOptionalParamMatcher();

      const result = matcher.match("/search/hello%20world");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ query: "hello world" });
    });
  });

  // ===========================================================================
  // Optional Params — buildPath
  // ===========================================================================

  describe("buildPath — optional params", () => {
    // eslint-disable-next-line sonarjs/no-identical-functions -- Test fixture intentionally similar to match suite - tests buildPath behavior vs match behavior
    function createOptionalBuildMatcher(): SegmentMatcher {
      const matcher = new SegmentMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search/:query?",
        fullName: "search",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should build path without optional param", () => {
      const matcher = createOptionalBuildMatcher();

      expect(matcher.buildPath("search")).toBe("/search");
    });

    it("should build path with optional param provided", () => {
      const matcher = createOptionalBuildMatcher();

      expect(matcher.buildPath("search", { query: "hello" })).toBe(
        "/search/hello",
      );
    });

    it("should build path with null optional param", () => {
      const matcher = createOptionalBuildMatcher();

      expect(matcher.buildPath("search", { query: null })).toBe("/search");
    });

    it("should not produce double slash for optional-in-middle", () => {
      const matcher = new SegmentMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search/:query?/results",
        fullName: "search",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["search", searchNode]]),
        nonAbsoluteChildren: [searchNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("search", { query: "test" })).toBe(
        "/search/test/results",
      );
      expect(matcher.buildPath("search", {})).toBe("/search/results");
    });

    it("should handle consecutive optionals in buildPath", () => {
      const matcher = new SegmentMatcher();

      const routeNode = createInputNode({
        name: "route",
        path: "/a/:b?/:c?/d",
        fullName: "route",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["route", routeNode]]),
        nonAbsoluteChildren: [routeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("route", { b: "x", c: "y" })).toBe("/a/x/y/d");
      expect(matcher.buildPath("route", { b: "x" })).toBe("/a/x/d");
      expect(matcher.buildPath("route", { c: "y" })).toBe("/a/y/d");
      expect(matcher.buildPath("route", {})).toBe("/a/d");
    });

    it("should encode optional param values", () => {
      const matcher = createOptionalBuildMatcher();

      expect(matcher.buildPath("search", { query: "hello world" })).toBe(
        "/search/hello%20world",
      );
    });

    it("should handle optional param at root level", () => {
      const matcher = new SegmentMatcher();

      const routeNode = createInputNode({
        name: "item",
        path: "/:slug?",
        fullName: "item",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["item", routeNode]]),
        nonAbsoluteChildren: [routeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("item")).toBe("/");
      expect(matcher.buildPath("item", { slug: "hello" })).toBe("/hello");
    });
  });

  // ===========================================================================
  // Slash-Child + Case-Insensitive
  // ===========================================================================

  describe("slash-child — case-insensitive", () => {
    it("should update static cache for slash-child with case-insensitive matching", () => {
      const matcher = new SegmentMatcher({ caseSensitive: false });

      const listNode = createInputNode({
        name: "list",
        path: "/",
        fullName: "users.list",
      });

      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["list", listNode]]),
        nonAbsoluteChildren: [listNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/Users");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[1].fullName).toBe("users.list");
    });
  });
});
