import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../../src/engine/path-matcher";
import { createMatcher } from "../../helpers/buildTree";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type {
  BuildParamSlot,
  CompiledRoute,
  MatcherInputNode,
  MatchResult,
  SegmentMatcher,
  SegmentMatcherOptions,
} from "../../../../src/engine/path-matcher";

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
    ...overrides,
  };
}

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
  });

  it("should compile CompiledRoute interface", () => {
    const route: CompiledRoute = {
      name: "home",
      parent: null,
      matchSegments: [],
      meta: {},
      declaredQueryParams: [],
      declaredQueryParamsSet: new Set(),
      hasTrailingSlash: false,
      constraintPatterns: new Map(),
      hasConstraints: false,
      buildStaticParts: ["/"],
      buildParamSlots: [],
      buildParamNamesSet: new Set(),
      cachedResult: undefined,
    };

    expect(route.name).toBe("home");
    expect(route.parent).toBeNull();
  });

  it("should compile BuildParamSlot interface", () => {
    const slot: BuildParamSlot = {
      paramName: "id",
      isOptional: false,
      encoder: encodeURIComponent,
    };

    expect(slot.paramName).toBe("id");
    expect(slot.isOptional).toBe(false);
    expect(slot.encoder).toBe(encodeURIComponent);
  });

  it("should compile MatchResult interface", () => {
    const result: MatchResult = {
      segments: [],
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
      parseQueryString: () => ({}),
      buildQueryString: () => "",
    };

    expect(options.caseSensitive).toBe(true);
  });
});

// =============================================================================
// SegmentMatcher Constructor
// =============================================================================

describe("SegmentMatcher", () => {
  describe("constructor", () => {
    it("should resolve default options", () => {
      const matcher = createTestMatcher();

      expect(matcher.options.caseSensitive).toBe(true);
      expect(matcher.options.strictTrailingSlash).toBe(false);
      expect(matcher.options.strictQueryParams).toBe(false);
      expect(matcher.options.urlParamsEncoding).toBe("default");
      expect(matcher.options.parseQueryString).toBeTypeOf("function");
      expect(matcher.options.buildQueryString).toBeTypeOf("function");
    });

    it("should resolve empty options to defaults", () => {
      const matcher = createTestMatcher({});

      expect(matcher.options.caseSensitive).toBe(true);
      expect(matcher.options.strictTrailingSlash).toBe(false);
    });

    it("should accept custom options", () => {
      const matcher = createTestMatcher({
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

      const matcher = createTestMatcher({
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
      const matcher = createTestMatcher();
      const node = createInputNode({ name: "home", path: "/" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("home")).toBe(true);
    });

    it("should return false for unregistered route", () => {
      const matcher = createTestMatcher();

      expect(matcher.hasRoute("nonexistent")).toBe(false);
    });

    it("should register route with path segments", () => {
      const matcher = createTestMatcher();
      const node = createInputNode({ name: "users", path: "/users" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("users")).toBe(true);
    });

    it("should register nested routes via children", () => {
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
  // registerTree — param-name conflict detection (#736)
  // ===========================================================================
  //
  // A parametric/splat position in the trie is keyed by POSITION but its value
  // is written under the NAME recorded on that position. Two routes sharing a
  // position under DIFFERENT names is unrepresentable — first registration wins
  // the name and the second route silently captures under the wrong key, which
  // through core's rewritePathOnMatch becomes a hard start() crash. Registration
  // must reject the ambiguity loudly instead of corrupting matches.

  describe("registerTree — param-name conflict detection (#736)", () => {
    /** Builds a root with two sibling top-level routes. */
    function twoRouteRoot(
      a: MatcherInputNode,
      b: MatcherInputNode,
    ): MatcherInputNode {
      return createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([
          [a.fullName, a],
          [b.fullName, b],
        ]),
        nonAbsoluteChildren: [a, b],
      });
    }

    it("throws when two routes share a param position under different names (issue repro)", () => {
      const matcher = createTestMatcher();

      const profile = createInputNode({
        name: "profile",
        path: "/profile",
        fullName: "userP.profile",
      });
      const user = createInputNode({
        name: "user",
        path: "/user/:id",
        fullName: "user",
      });
      const userP = createInputNode({
        name: "userP",
        path: "/user/:slug",
        fullName: "userP",
        children: new Map([["profile", profile]]),
        nonAbsoluteChildren: [profile],
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(user, userP));
      }).toThrow(/Parameter name conflict/);
    });

    it("error names both conflicting params and the marker", () => {
      const matcher = createTestMatcher();

      const user = createInputNode({
        name: "user",
        path: "/user/:id",
        fullName: "user",
      });
      const userP = createInputNode({
        name: "userP",
        path: "/user/:slug",
        fullName: "userP",
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(user, userP));
      }).toThrow(/':id' and ':slug'/);
    });

    it("throws when two routes share a splat position under different names", () => {
      const matcher = createTestMatcher();

      const file = createInputNode({
        name: "file",
        path: "/files/*path",
        fullName: "file",
      });
      const fileR = createInputNode({
        name: "fileR",
        path: "/files/*rest",
        fullName: "fileR",
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(file, fileR));
      }).toThrow(/'\*path' and '\*rest'/);
    });

    it("throws when two routes share an optional-param position under different names", () => {
      const matcher = createTestMatcher();

      const search = createInputNode({
        name: "search",
        path: "/search/:q?",
        fullName: "search",
      });
      const searchT = createInputNode({
        name: "searchT",
        path: "/search/:term?",
        fullName: "searchT",
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(search, searchT));
      }).toThrow(/Parameter name conflict/);
    });

    it("throws for a conflict nested deep in the tree", () => {
      const matcher = createTestMatcher();

      const a = createInputNode({
        name: "a",
        path: "/shop/:cat/items/:id",
        fullName: "a",
      });
      const b = createInputNode({
        name: "b",
        path: "/shop/:cat/items/:sku",
        fullName: "b",
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(a, b));
      }).toThrow(/':id' and ':sku'/);
    });

    it("does NOT throw when both routes use the same param name", () => {
      const matcher = createTestMatcher();

      const profile = createInputNode({
        name: "profile",
        path: "/profile",
        fullName: "userP.profile",
      });
      // Both routes reuse the SAME ':id' position with the SAME name — the #736
      // case that must NOT throw. They terminate at DISTINCT paths, though
      // (`/user/:id/settings` vs `/user/:id` vs `/user/:id/profile`), so the #1153
      // duplicate-effective-path guard is not (correctly) triggered.
      const user = createInputNode({
        name: "user",
        path: "/user/:id/settings",
        fullName: "user",
      });
      const userP = createInputNode({
        name: "userP",
        path: "/user/:id",
        fullName: "userP",
        children: new Map([["profile", profile]]),
        nonAbsoluteChildren: [profile],
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(user, userP));
      }).not.toThrow();
    });

    it("reuses a same-named splat position without a #736 conflict (the dup is then a #1153 reject)", () => {
      const matcher = createTestMatcher();

      const file = createInputNode({
        name: "file",
        path: "/files/*path",
        fullName: "file",
      });
      const fileMeta = createInputNode({
        name: "fileMeta",
        path: "/files/*path",
        fullName: "fileMeta",
      });

      // The #736 guard reuses the same-named splat position without a name
      // conflict; a splat is terminal, so the two routes then resolve to the SAME
      // effective path — #1153 rejects the duplicate (it is NOT a #736 error).
      expect(() => {
        matcher.registerTree(twoRouteRoot(file, fileMeta));
      }).toThrow(/Duplicate route path/);
    });

    it("does NOT treat a single route's consecutive optionals as a conflict", () => {
      // Within ONE route, omitting `:b?` lets the next param occupy `:b?`'s
      // slot — established positional-optional semantics, not a cross-route
      // collision. The guard must stay silent here even though two differently
      // named params (`b`, `c`) land on the same trie position.
      const matcher = createTestMatcher();

      const route = createInputNode({
        name: "route",
        path: "/a/:b?/:c?/d",
        fullName: "route",
      });

      expect(() => {
        matcher.registerTree(
          createInputNode({
            name: "",
            path: "",
            fullName: "",
            children: new Map([["route", route]]),
            nonAbsoluteChildren: [route],
          }),
        );
      }).not.toThrow();
    });

    it("does NOT treat a single route's optional-then-required param as a conflict", () => {
      const matcher = createTestMatcher();

      const route = createInputNode({
        name: "route",
        path: "/a/:b?/:c/d",
        fullName: "route",
      });

      expect(() => {
        matcher.registerTree(
          createInputNode({
            name: "",
            path: "",
            fullName: "",
            children: new Map([["route", route]]),
            nonAbsoluteChildren: [route],
          }),
        );
      }).not.toThrow();
    });

    it("does NOT throw for different names at DIFFERENT positions", () => {
      const matcher = createTestMatcher();

      const a = createInputNode({
        name: "a",
        path: "/a/:x",
        fullName: "a",
      });
      const b = createInputNode({
        name: "b",
        path: "/b/:y",
        fullName: "b",
      });

      expect(() => {
        matcher.registerTree(twoRouteRoot(a, b));
      }).not.toThrow();
    });

    it("captures params under the terminal route's name once the conflict is removed", () => {
      const matcher = createTestMatcher();

      // Same ':id' position, same name, DISTINCT terminals (#1153-safe): the
      // routes reuse the shared param position without a #736 conflict and without
      // a duplicate effective path.
      const profile = createInputNode({
        name: "profile",
        path: "/profile",
        fullName: "userP.profile",
      });
      const user = createInputNode({
        name: "user",
        path: "/user/:id/settings",
        fullName: "user",
      });
      const userP = createInputNode({
        name: "userP",
        path: "/user/:id",
        fullName: "userP",
        children: new Map([["profile", profile]]),
        nonAbsoluteChildren: [profile],
      });

      matcher.registerTree(twoRouteRoot(user, userP));

      expect(matcher.match("/user/joe")?.params).toStrictEqual({ id: "joe" });
      expect(matcher.match("/user/joe/profile")?.params).toStrictEqual({
        id: "joe",
      });
    });
  });

  // ===========================================================================
  // registerTree — bare unnamed marker rejection (#858)
  // ===========================================================================
  //
  // A bare marker (`:` or `*` with no name) is a name-less param/splat: at match
  // the trie captures the value under an EMPTY key, while buildPath emits a
  // literal `:`/`*` and buildParamMeta reports no param at all — a three-way
  // match/build/meta desync of the same signature class as #736/#738.
  // registerTree must reject it loudly instead of creating a phantom
  // empty-named slot. (`:` behaves identically to `*` — the root is ANY
  // name-less marker, not just bare splat.)

  describe("registerTree — bare unnamed marker rejection (#858)", () => {
    function singleRoute(path: string): MatcherInputNode {
      const route = createInputNode({ name: "r", path, fullName: "r" });

      return createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["r", route]]),
        nonAbsoluteChildren: [route],
      });
    }

    it("throws on a bare splat '*' with no name", () => {
      expect(() => {
        createTestMatcher().registerTree(singleRoute("/files/*"));
      }).toThrow(/\[SegmentMatcher\.registerTree\].*'\*'/);
    });

    it("throws on a bare param ':' with no name", () => {
      expect(() => {
        createTestMatcher().registerTree(singleRoute("/files/:"));
      }).toThrow(/\[SegmentMatcher\.registerTree\].*':'/);
    });

    it("throws on a bare param carrying only a constraint or optional marker", () => {
      expect(() => {
        createTestMatcher().registerTree(singleRoute("/x/:?"));
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);

      expect(() => {
        createTestMatcher().registerTree(singleRoute(String.raw`/y/:<\d+>`));
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("still accepts a named splat (control)", () => {
      expect(() => {
        createTestMatcher().registerTree(singleRoute("/files/*path"));
      }).not.toThrow();
    });
  });

  // A `:`/`*` marker fused to a static prefix WITHIN a segment (`/a:b`,
  // `/users/x:id`, `/a*b`) is extracted as a param by build/meta (unanchored
  // regex) but the trie compiles the whole segment as a static literal — so
  // buildPath emits an unmatchable URL while match() rejects it (#1050). The
  // sibling of the #858 name-less rejection: an ambiguous marker placement the
  // three parsers cannot agree on, rejected loudly at registerTree.
  describe("registerTree — fused mid-segment marker rejection (#1050)", () => {
    it("throws on a param ':' fused to a static prefix (/a:b)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/a:b" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("throws on a param fused mid-segment (/users/x:id)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/users/x:id" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("throws on a splat '*' fused to a static prefix (/a*b)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/a*b" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("still accepts a boundary marker (control, /a/:b)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/a/:b" }]);
      }).not.toThrow();
    });

    it("still accepts a marker-led segment whose name contains ':' (control, /:a:b → param 'a:b')", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:a:b" }]);
      }).not.toThrow();
    });
  });

  // A `:`/`*` marker fused to the END of a param name (`/:y*`, `/:y:`) — the
  // build/meta name class `[^/?<]+` greedily swallows the trailing marker into
  // the name (`y*`) while the route-tree gate reads it as name-less and rejects.
  // parseSegment ends the name before a trailing marker (#1324), so this backstop
  // now agrees with the gate — the former excluded gate↔backstop divergence is
  // closed. The trie L3 flip: bare core previously registered this dead route.
  describe("registerTree — trailing parameter marker rejection (#1324)", () => {
    it("throws on a param name ending in a bare '*' (/:y*)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:y*" }]);
      }).toThrow(/Trailing parameter marker/);
    });

    it("throws on a param name ending in a bare ':' (/:y:)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:y:" }]);
      }).toThrow(/Trailing parameter marker/);
    });

    it("throws on a splat name ending in a bare marker (/*y:)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/*y:" }]);
      }).toThrow(/Trailing parameter marker/);
    });

    // A `?`-suffixed non-marker segment routed through the optional fork tokenizes
    // as `static`, not a param — a static segment cannot be optional (#1241).
    it("throws on a '?'-suffixed static segment (/faq? — not optional, #1241)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/faq?" }]);
      }).toThrow(/Empty parameter name/);
    });
  });

  // Static text fused AFTER a constraint (`/:year<\d+>-archive`, `/:id<\d+>.html`):
  // meta terminates the name at `<` (name `year`), but build strips `<…>` then
  // re-extracts greedily (name `year-archive`) — build name ≠ meta name, so the
  // route compiles to a silent dead route. The mirror of #1050 on the other side
  // of the param; route-tree's gate backstops with a route-contextual message.
  describe("registerTree — fused constraint suffix rejection (#1150)", () => {
    it("throws on static text fused after a constraint (/:year<...>-archive)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: String.raw`/:year<\d+>-archive` }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("throws on a '.html' suffix fused after a constraint", () => {
      expect(() => {
        createMatcher([{ name: "r", path: String.raw`/post/:id<\d+>.html` }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("still accepts a constraint that ends its segment (controls)", () => {
      for (const path of [
        String.raw`/:id<\d+>`, // constraint at end
        String.raw`/:id<\d+>/edit`, // followed by '/'
        String.raw`/:id<\d+>?`, // followed by an optional '?'
        "/:id<[a/b]>", // '/' inside the constraint body
      ]) {
        expect(() => createMatcher([{ name: "r", path }])).not.toThrow();
      }
    });

    it("throws on a `<...>` constraint in a CLEAN static segment (/foo<bar>, #1311)", () => {
      // A constraint filling a static segment (no ':'/'*' marker) is silently
      // stripped to '/foo' by CONSTRAINT_PATTERN_RGX — #1150 catches only a
      // constraint fused with TRAILING text (`/:id<\d+>x`); a constraint that
      // cleanly ends a static segment slips through. Reject it, sibling of #1050.
      for (const path of ["/foo<bar>", "/a<b>", String.raw`/x<\d+>`]) {
        expect(() => createMatcher([{ name: "r", path }])).toThrow(
          /\[SegmentMatcher\.registerTree\]/,
        );
      }
    });
  });

  // A param name repeated within one route (`/:id/:id`, a param+splat clash
  // `/:x/*x`, or a parent's param reused by a child) binds two trie positions under
  // one name — match's later capture overwrites the earlier and rewrites the user's
  // URL (#1151). The #736 conflict guard only fires on DIFFERENTLY-named params.
  describe("registerTree — duplicate param name rejection (#1151)", () => {
    it("throws on the same param name twice in one path (/:id/:id)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:id/:id" }]);
      }).toThrow(/Duplicate parameter name/);
    });

    it("throws on a param+splat name clash (/:x/*x)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:x/*x" }]);
      }).toThrow(/Duplicate parameter name/);
    });

    it("throws on a parent's param reused by a child (cross-level)", () => {
      expect(() => {
        createMatcher([
          { name: "p", path: "/a/:x", children: [{ name: "c", path: "/:x" }] },
        ]);
      }).toThrow(/Duplicate parameter name/);
    });

    it("still accepts distinct names, incl. #736 consecutive optionals (controls)", () => {
      expect(() =>
        createMatcher([{ name: "r", path: "/:a/:b" }]),
      ).not.toThrow();
      expect(() =>
        createMatcher([{ name: "r", path: "/a/:b?/:c?/d" }]),
      ).not.toThrow();
      // the SAME name in DIFFERENT routes is fine — only intra-route dups reject
      expect(() =>
        createMatcher([
          { name: "a", path: "/x/:id" },
          { name: "b", path: "/y/:id" },
        ]),
      ).not.toThrow();
    });
  });

  // Two routes compiling to the SAME trie terminal — flat /a/b vs nested a→b, or
  // /x vs /x/ — silently shadowed each other (the later's deep link resolved to the
  // earlier route). A STRONG (full-insertion) terminal write now rejects a second
  // strong write by a DIFFERENT route; a WEAK (optional-omit) owner is legitimately
  // displaced, and a same-route revisit is idempotent (#1153).
  describe("registerTree — duplicate effective path rejection (#1153)", () => {
    it("throws when a flat and a nested route resolve to the same path", () => {
      expect(() => {
        createMatcher([
          { name: "a", path: "/a", children: [{ name: "b", path: "/b" }] },
          { name: "ab", path: "/a/b" },
        ]);
      }).toThrow(/Duplicate route path/);
    });

    it("throws on trailing-slash variants (/x vs /x/)", () => {
      expect(() => {
        createMatcher([
          { name: "a", path: "/x" },
          { name: "b", path: "/x/" },
        ]);
      }).toThrow(/Duplicate route path/);
    });

    it("throws on two routes at the root path", () => {
      expect(() => {
        createMatcher([
          { name: "a", path: "/" },
          { name: "b", path: "/" },
        ]);
      }).toThrow(/Duplicate route path/);
    });

    it("still accepts distinct routes, optional-omit fan-out, and weak→strong (controls)", () => {
      expect(() =>
        createMatcher([
          { name: "a", path: "/a" },
          { name: "b", path: "/b" },
        ]),
      ).not.toThrow();
      // a single route's optional-omit revisits its own terminal — idempotent
      expect(() =>
        createMatcher([{ name: "r", path: "/a/:b?/:c?/d" }]),
      ).not.toThrow();
      // an optional's omit weakly claims the root; a full "/" route displaces it
      expect(() =>
        createMatcher([
          { name: "opt", path: "/:a?" },
          { name: "root", path: "/" },
        ]),
      ).not.toThrow();
    });
  });

  // A raw non-ASCII code point in a STATIC segment (/café, /меню) registers but
  // never matches — match rejects non-ASCII input (#scanPath) and compares static
  // keys raw (#1154). Reject at registration with the percent-encode workaround.
  describe("registerTree — non-ASCII static segment rejection (#1154)", () => {
    it("throws on a Latin-1 static segment (/café)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/café" }]);
      }).toThrow(/Non-ASCII static segment/);
    });

    it("throws on Cyrillic and CJK static segments", () => {
      expect(() => createMatcher([{ name: "r", path: "/меню" }])).toThrow(
        /Non-ASCII static segment/,
      );
      expect(() => createMatcher([{ name: "r", path: "/新闻" }])).toThrow(
        /Non-ASCII static segment/,
      );
    });

    it("still accepts the percent-encoded form, a non-ASCII param name, and ASCII (controls)", () => {
      expect(() =>
        createMatcher([{ name: "r", path: "/caf%C3%A9" }]),
      ).not.toThrow();
      // a non-ASCII PARAM name is fine — only static text is compared raw
      expect(() =>
        createMatcher([{ name: "r", path: "/:café" }]),
      ).not.toThrow();
      expect(() =>
        createMatcher([{ name: "r", path: "/users/list" }]),
      ).not.toThrow();
    });
  });

  // Malformed query-param declarations (#1242 §5.1/§5.2/§5.3): a query name carrying
  // constraint/query metacharacters (a modifier-order typo or a '=' in the decl), or
  // one colliding with a path-param name — all degraded silently before.
  describe("registerTree — malformed query-param declaration rejection (#1242)", () => {
    it("throws on a reverse-order modifier leaking a constraint into the query name (§5.1)", () => {
      expect(() =>
        createMatcher([{ name: "r", path: String.raw`/a/:b?<\d+>` }]),
      ).toThrow(/Invalid query-param declaration/);
    });

    it("throws on a path-param / query-param name collision (§5.3)", () => {
      expect(() => createMatcher([{ name: "r", path: "/a/:tab?tab" }])).toThrow(
        /Name collision/,
      );
    });

    it("still accepts clean query declarations, incl. tolerated ?name=value (controls)", () => {
      for (const path of [
        "/a?valid",
        "/a/:id?q",
        "/a?a&b", // '&' separates two query names — neither is malformed
        String.raw`/a/:id<\d+>?q`, // correct modifier order: constraint, then query
        "/a?tab=1", // a '=' in the declaration is tolerated today (§5.2 not folded in)
        "/search?first&second",
      ]) {
        expect(() => createMatcher([{ name: "r", path }])).not.toThrow();
      }
    });
  });

  // An index route (path "/") under an OPTIONAL-param or SPLAT parent is
  // unreachable/inconsistent (#1242 §5.4). A REQUIRED-param parent has no omit form,
  // so its slash-child is coherent (existing behaviour) — allowed.
  describe("registerTree — index under an optional/splat parent rejection (#1242 §5.4)", () => {
    it("throws for an index (path '/') under an optional-param parent", () => {
      expect(() =>
        createMatcher([
          { name: "p", path: "/a/:b?", children: [{ name: "idx", path: "/" }] },
        ]),
      ).toThrow(/Index route .* is not supported/);
    });

    it("throws for an index under a splat parent", () => {
      expect(() =>
        createMatcher([
          {
            name: "p",
            path: "/files/*rest",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).toThrow(/Index route .* is not supported/);
    });

    it("still accepts an index under a required-param or static parent (controls)", () => {
      expect(() =>
        createMatcher([
          {
            name: "p",
            path: "/users/:id",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).not.toThrow();
      expect(() =>
        createMatcher([
          { name: "p", path: "/a/b", children: [{ name: "idx", path: "/" }] },
        ]),
      ).not.toThrow();
    });
  });

  // #1294: the §5.4 gate checked only the LAST parent segment, so an index under a
  // parent with an optional param in a MID-path position registered silently while
  // the index bound only the take form (present on the full path, absent on every
  // omit form — `/a/:b?/c` + idx: `/a/x/c/` → idx, `/a/c/` → parent). Extended to
  // reject an optional param ANYWHERE in the parent path (follow-up of #1242 §5.4).
  describe("registerTree — index under a mid-path optional parent rejection (#1294)", () => {
    it("throws for an index whose parent's optional is NOT the last segment", () => {
      expect(() =>
        createMatcher([
          {
            name: "p",
            path: "/a/:b?/c",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).toThrow(/Index route .* is not supported/);
    });

    it("throws for an index under two mid-path optionals", () => {
      expect(() =>
        createMatcher([
          {
            name: "p",
            path: "/a/:b?/:c?/d",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).toThrow(/Index route .* is not supported/);
    });

    it("still accepts an index under a REQUIRED mid-path param (one form, coherent)", () => {
      expect(() =>
        createMatcher([
          {
            name: "p",
            path: "/a/:b/c",
            children: [{ name: "idx", path: "/" }],
          },
        ]),
      ).not.toThrow();
    });
  });

  // #1266: a `/*rest` catch-all next to a constrained `/:v<c>/*rest` sibling. The `:v`
  // paramChild greedily commits (INVARIANTS #8), the constraint is validated only
  // after the full traverse (#857, no backtrack), so a first segment failing `v\d+`
  // dies in the param branch instead of falling to the `/*rest` splat sibling — the
  // catch-all is unreachable and its `buildPath` yields dead deep-links. Generalizes
  // the optional-successor try-take-if-valid (#1264 A1) to a REQUIRED param — no
  // `optional` anywhere.
  describe("match — catch-all reachable next to a constrained param+splat sibling (#1266)", () => {
    const routes = [
      { name: "all", path: "/*rest" },
      { name: "ver", path: String.raw`/:v<v\d+>/*rest` },
    ];

    it("falls back to the /*rest catch-all when the first segment fails the constraint", () => {
      const m = createMatcher(routes);
      const one = m.match("/users");

      expect(one?.segments.at(-1)?.name).toBe("all");
      expect(one?.params).toStrictEqual({ rest: "users" });
      // multi-segment too
      expect(m.match("/a/b")?.params).toStrictEqual({ rest: "a/b" });
    });

    it("still resolves the constrained versioned form (constraint passes → param)", () => {
      const m = createMatcher(routes);
      const r = m.match("/v1/users");

      expect(r?.segments.at(-1)?.name).toBe("ver");
      expect(r?.params).toStrictEqual({ v: "v1", rest: "users" });
    });

    it("buildPath on the catch-all round-trips (no dead deep-link)", () => {
      const m = createMatcher(routes);
      const url = m.buildPath("all", { rest: "users" });

      expect(m.match(url)?.segments.at(-1)?.name).toBe("all");
    });

    it("is registration-order independent (splat sibling registered second)", () => {
      const m = createMatcher([routes[1], routes[0]]);

      expect(m.match("/users")?.params).toStrictEqual({ rest: "users" });
      expect(m.match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
    });
  });

  // #1283: the try-take-if-valid fork (A1 #1264 / required #1266) skips to the splat
  // only when the constraint FAILS. When a constraint-SATISFYING segment is also the
  // LAST one and the take-node is a dead terminal (no route, only a would-be-empty
  // splat child), the take dead-ends → UNMATCH while buildPath emits that URL — a
  // `range(buildPath) ⊄ dom(match)` dead deep-link, the exact class try-take-if-valid
  // was built to close.
  describe("match — try-take-if-valid fork last-segment dead-end falls to splat (#1283)", () => {
    it("opt→splat: a single constraint-satisfying last segment resolves the omit form", () => {
      const m = createMatcher([
        { name: "r", path: String.raw`/:v<v\d+>?/*rest` },
      ]);

      // build of the omit form is "/v1"; match must resolve it, not UNMATCH
      expect(m.match("/v1")?.params).toStrictEqual({ rest: "v1" });
      // the take form (multi-segment) still resolves under the optional's name
      expect(m.match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
    });

    it("#1266 required→splat: a single constraint-satisfying segment falls to the catch-all sibling", () => {
      const m = createMatcher([
        { name: "all", path: "/*rest" },
        { name: "ver", path: String.raw`/:v<v\d+>/*rest` },
      ]);

      const r = m.match("/v1");

      expect(r?.segments.at(-1)?.name).toBe("all");
      expect(r?.params).toStrictEqual({ rest: "v1" });
      // the multi-segment versioned form still resolves to ver
      expect(m.match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
    });

    it("preserves present-first: a take-node WITH a terminal route still takes (not skip)", () => {
      const m = createMatcher([
        { name: "rest", path: String.raw`/:v<v\d+>?/*rest` },
        { name: "bare", path: String.raw`/:v<v\d+>` },
      ]);

      // /v1 → the bare :v terminal (a valid take), NOT the splat omit form
      const r = m.match("/v1");

      expect(r?.segments.at(-1)?.name).toBe("bare");
      expect(r?.params).toStrictEqual({ v: "v1" });
    });
  });

  // #1284: one trie slot legally serves several routes with DIFFERENT constraints
  // under the same param name. #1266 marked `fork.constraint ??= <first>`, so with a
  // splat sibling present, `match` used only the FIRST-registered route's constraint
  // as the slot-wide validity signal — a value matching a LATER route's constraint
  // failed the fork and fell to the catch-all, killing that route (order-dependent).
  describe("registerTree — same-name constrained siblings coexist under a splat sibling (#1284)", () => {
    const routes = [
      { name: "num", path: String.raw`/user/:id<\d+>/a` },
      { name: "hex", path: "/user/:id<[a-f]+>/b" },
      { name: "all", path: "/user/*rest" },
    ];

    it("routes to the hex sibling when the numeric constraint fails (not the catch-all)", () => {
      const m = createMatcher(routes);
      const r = m.match("/user/abc/b");

      expect(r?.segments.at(-1)?.name).toBe("hex");
      expect(r?.params).toStrictEqual({ id: "abc" });
    });

    it("still routes a numeric id to the numeric sibling", () => {
      const m = createMatcher(routes);

      expect(m.match("/user/123/a")?.segments.at(-1)?.name).toBe("num");
    });

    it("is registration-order independent (hex registered first)", () => {
      const m = createMatcher([routes[1], routes[0], routes[2]]);

      expect(m.match("/user/123/a")?.params).toStrictEqual({ id: "123" });
      expect(m.match("/user/abc/b")?.params).toStrictEqual({ id: "abc" });
    });

    it("a value matching NEITHER constraint still falls to the catch-all", () => {
      const m = createMatcher(routes);
      const r = m.match("/user/xyz/b"); // xyz ∉ \d+ and ∉ [a-f]+

      expect(r?.segments.at(-1)?.name).toBe("all");
      expect(r?.params).toStrictEqual({ rest: "xyz/b" });
    });

    it("two SAME-constraint siblings need no disjunction (identical source is a no-op)", () => {
      const m = createMatcher([
        { name: "a", path: String.raw`/user/:id<\d+>/a` },
        { name: "c", path: String.raw`/user/:id<\d+>/c` }, // identical \d+ constraint
        { name: "all", path: "/user/*rest" },
      ]);

      expect(m.match("/user/1/a")?.segments.at(-1)?.name).toBe("a");
      expect(m.match("/user/2/c")?.segments.at(-1)?.name).toBe("c");
      expect(m.match("/user/xyz/a")?.segments.at(-1)?.name).toBe("all");
    });
  });

  // #1287: two (or more) optional params directly before a splat can't be represented
  // by a single trie-slot fork — the outer optional's mark overwrites the inner's,
  // silently reshaping the omit-outer/take-inner form into the splat
  // (`/:a<c1>?/:b<c2>?/*rest`: `/ab/x` → {rest:"ab/x"} instead of {b:"ab",rest:"x"}).
  // Rejected at registration (both must be constrained, else #1264 B caught the inner).
  describe("registerTree — two optionals before a splat rejected (#1287)", () => {
    it("throws for two constrained optionals directly before a splat", () => {
      expect(() =>
        createMatcher([
          { name: "r", path: String.raw`/:a<\d+>?/:b<[a-f]+>?/*rest` },
        ]),
      ).toThrow(/optional/i);
    });

    it("still accepts a single constrained optional before a splat (#1264 A1)", () => {
      expect(() =>
        createMatcher([{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }]),
      ).not.toThrow();
    });

    it("still accepts two optionals NOT before a splat (opt→opt, static tail)", () => {
      expect(() =>
        createMatcher([{ name: "r", path: "/:a?/:b?/tail" }]),
      ).not.toThrow();
    });
  });

  // #1286: the A2 optional-successor rename (#1263) disambiguates by segment count on
  // the LAST segment only, so it covers a TERMINAL successor (`/:a?/:b`) but NOT a
  // non-terminal one (`/:a?/:b/c`) — the omit form then binds under the OPTIONAL's
  // name, not the successor's. Pinned as a documented limitation (the general fix,
  // variable-depth remaining-segment counting, is disproportionate); see CLAUDE.md.
  describe("match — A2 rename covers only a terminal successor (#1286, caveat-lock)", () => {
    it("binds the omit form under the optional's name for a NON-terminal successor (known limitation)", () => {
      const m = createMatcher([{ name: "r", path: "/:a?/:b/c" }]);

      // wanted { b: "x" }; the A2 rename does not reach a non-terminal successor
      expect(m.match("/x/c")?.params).toStrictEqual({ a: "x" });
      // the present form is unaffected
      expect(m.match("/1/x/c")?.params).toStrictEqual({ a: "1", b: "x" });
    });

    it("still renames correctly for a TERMINAL successor (#1263 A2)", () => {
      const m = createMatcher([{ name: "r", path: "/:a?/:b" }]);

      expect(m.match("/x")?.params).toStrictEqual({ b: "x" });
    });
  });

  // An unbalanced constraint delimiter (`/:id<\d+`, stray `>`) or a semantically
  // empty `<>` desyncs match vs build the same way name-less (#858) / fused
  // (#1050) markers do: bare core built these silently and buildPath then emitted
  // a garbage URL (`/x/1<\d+`). registerTree is the bare-core backstop that
  // rejects them for every consumer, not only under validation-plugin (#804).
  describe("registerTree — unbalanced/empty constraint rejection (#804)", () => {
    it("throws on an unclosed constraint '<' (/x/:id<[0-9]+)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: String.raw`/x/:id<\d+` }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\].*[Uu]nbalanced/);
    });

    it("throws on a lone opening '<' (/x/:id<)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/x/:id<" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("throws on a stray closing '>' (/x/a>b)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/x/a>b" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\]/);
    });

    it("throws on the empty constraint '<>' (/x/:id<>)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/x/:id<>" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\].*[Ee]mpty/);
    });

    it("throws on the empty constraint before an optional marker (/x/:id<>?/y)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/x/:id<>?/y" }]);
      }).toThrow(/\[SegmentMatcher\.registerTree\].*[Ee]mpty/);
    });

    it("still accepts a well-formed constraint (control, /x/:id<[0-9]+>)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: String.raw`/x/:id<\d+>` }]);
      }).not.toThrow();
    });

    it("still accepts a well-formed constrained-optional (control, /x/:id<[0-9]+>?)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: String.raw`/x/:id<\d+>?` }]);
      }).not.toThrow();
    });

    it("still accepts a '<' inside the constraint body (control, /:id<[a<b]>)", () => {
      expect(() => {
        createMatcher([{ name: "r", path: "/:id<[a<b]>" }]);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // build↔match grammar agreement (#738)
  // ===========================================================================
  //
  // The build-path grammar was narrower than the match-path grammar: match()
  // recognized names/constraints that buildPath() then rejected with "Missing
  // required param", crashing start() via rewritePathOnMatch. These lock the
  // two grammars together.

  describe("build↔match grammar agreement (#738)", () => {
    function singleRouteMatcher(name: string, path: string): SegmentMatcher {
      const matcher = createTestMatcher();
      const route = createInputNode({ name, path, fullName: name });
      const root = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([[name, route]]),
        nonAbsoluteChildren: [route],
      });

      matcher.registerTree(root);

      return matcher;
    }

    it.each([
      ["/h/:my-param", "my-param"],
      ["/h/:a.b", "a.b"],
      ["/h/:user~id", "user~id"],
    ])(
      "round-trips a non-word-char param name in '%s' (match key === build key)",
      (path, key) => {
        const matcher = singleRouteMatcher("h", path);

        expect(matcher.match("/h/v")?.params).toStrictEqual({ [key]: "v" });
        expect(() => matcher.buildPath("h", { [key]: "v" })).not.toThrow();
        expect(matcher.buildPath("h", { [key]: "v" })).toBe("/h/v");
      },
    );

    it("does not crash building a route whose constraint contains a `?`", () => {
      const matcher = singleRouteMatcher("a", String.raw`/a/:id<\d?>`);

      // The lazy-quantifier `?` no longer destroys the slot/metadata.
      expect(matcher.match("/a/5")?.params).toStrictEqual({ id: "5" });
      expect(matcher.buildPath("a", { id: "5" })).toBe("/a/5");
    });

    it("enforces the constraint that survived query detection (#738)", () => {
      const matcher = singleRouteMatcher("a", String.raw`/a/:id<\d?>`);

      // \d? matches a single digit or empty — two digits must be rejected.
      expect(matcher.match("/a/55")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Constraint validation uses the DECODED value (#857)
  // ===========================================================================

  describe("constraint validation uses the decoded value (#857)", () => {
    function constrainedMatcher(path: string): SegmentMatcher {
      const matcher = createTestMatcher();
      const route = createInputNode({ name: "r", path, fullName: "r" });
      const root = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["r", route]]),
        nonAbsoluteChildren: [route],
      });

      matcher.registerTree(root);

      return matcher;
    }

    it("matches an over-encoded value whose decoded form satisfies the constraint", () => {
      // `%35` decodes to "5", which satisfies <\d+>. The constraint must be
      // checked on the decoded value, not the raw segment (#857).
      const matcher = constrainedMatcher(String.raw`/:n<\d+>`);

      expect(matcher.match("/%35")?.params).toStrictEqual({ n: "5" });
    });

    it("extracted param always satisfies the constraint (Matching #9)", () => {
      // `%41` is 3 chars (raw satisfies <.{3}>) but decodes to "A" (1 char), which
      // does NOT. match() must reject it, not return a value violating its own
      // constraint (the old order returned { n: "A" }).
      const matcher = constrainedMatcher("/:n<.{3}>");

      expect(matcher.match("/%41")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Static Route Matching
  // ===========================================================================

  describe("match — static routes", () => {
    function createStaticMatcher(): SegmentMatcher {
      const matcher = createTestMatcher();
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

    it("should reject paths with double slashes", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about//");

      expect(result).toBeUndefined();
    });

    it("should reject paths with multiple consecutive slashes", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("///about");

      expect(result).toBeUndefined();
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

    it("should strip a fragment that appears AFTER the query string (#842)", () => {
      const matcher = createStaticMatcher();

      const plain = matcher.match("/about?key=value");
      const withHash = matcher.match("/about?key=value#section");

      expect(withHash).toBeDefined();
      // Without the fix, `key` would capture "value#section" (the fragment
      // folded into the query value). Result must equal the no-fragment match.
      expect(withHash!.params).toStrictEqual(plain!.params);
      expect(withHash!.params).toStrictEqual({ key: "value" });
    });

    it("should treat a fragment right after the query separator as empty query (#842)", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about?#section");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("about");
      expect(result!.params).toStrictEqual({});
    });

    it("should strip a post-query fragment for a param route + declared query (#842)", () => {
      const matcher = createTestMatcher();
      const profileNode = createInputNode({
        name: "profile",
        path: "/:id?tab",
        fullName: "users.profile",
      });
      const usersNode = createInputNode({
        name: "users",
        path: "/users",
        fullName: "users",
        children: new Map([["profile", profileNode]]),
        nonAbsoluteChildren: [profileNode],
      });

      matcher.registerTree(
        createInputNode({
          name: "",
          path: "",
          fullName: "",
          children: new Map([["users", usersNode]]),
          nonAbsoluteChildren: [usersNode],
        }),
      );

      const result = matcher.match("/users/v?tab=x#frag");

      expect(result).toBeDefined();
      // `tab` must be "x", not "x#frag".
      expect(result!.params).toStrictEqual({ id: "v", tab: "x" });
    });

    it("should let a query key override a same-named path param (documented, #843)", () => {
      const matcher = createTestMatcher();
      const idNode = createInputNode({
        name: "id",
        path: "/:id",
        fullName: "u.id",
      });
      const uNode = createInputNode({
        name: "u",
        path: "/u",
        fullName: "u",
        children: new Map([["id", idNode]]),
        nonAbsoluteChildren: [idNode],
      });

      matcher.registerTree(
        createInputNode({
          name: "",
          path: "",
          fullName: "",
          children: new Map([["u", uNode]]),
          nonAbsoluteChildren: [uNode],
        }),
      );

      // INVARIANTS Matching #25: query params merge into the same object as path
      // params (query last), so a same-named query key overwrites the path value.
      // `buildPath` never emits this shape — roundtrip is unaffected.
      const result = matcher.match("/u/5?id=9");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "9" });
    });

    it("should return correct meta", () => {
      const matcher = createStaticMatcher();

      const result = matcher.match("/about");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({});
    });

    it("should handle case-sensitive matching (default)", () => {
      const matcher = createStaticMatcher();

      expect(matcher.match("/About")).toBeUndefined();
      expect(matcher.match("/ABOUT")).toBeUndefined();
    });

    it("should handle case-insensitive matching", () => {
      const matcher = createTestMatcher({ caseSensitive: false });
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      expect(result!.meta).toStrictEqual({});
    });
  });

  // ===========================================================================
  // buildPath — static routes
  // ===========================================================================

  describe("buildPath — static routes", () => {
    function createStaticMatcher(): SegmentMatcher {
      const matcher = createTestMatcher();
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

      expect(() => matcher.buildPath("unknown")).toThrow(
        "[SegmentMatcher.buildPath] 'unknown' is not defined",
      );
    });

    it("should build nested static path", () => {
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();

      expect(matcher.getSegmentsByName("unknown")).toBeUndefined();
    });

    it("should return frozen segments array", () => {
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();
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
      const matcher = createTestMatcher();

      expect(matcher.getMetaByName("home")).toBeUndefined();
    });

    it("should return meta for registered route", () => {
      const matcher = createTestMatcher();
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

      expect(meta).toStrictEqual({});
    });

    it("should return frozen meta object", () => {
      const matcher = createTestMatcher();
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
  // hasRoute
  // ===========================================================================

  describe("hasRoute", () => {
    it("should return true for registered route", () => {
      const matcher = createTestMatcher();
      const node = createInputNode({ name: "home", path: "/" });

      matcher.registerTree(node);

      expect(matcher.hasRoute("home")).toBe(true);
    });

    it("should return false for unregistered route", () => {
      const matcher = createTestMatcher();

      expect(matcher.hasRoute("anything")).toBe(false);
    });

    it("should use fullName for lookup", () => {
      const matcher = createTestMatcher();

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
      options?: Partial<SegmentMatcherOptions>,
    ): SegmentMatcher {
      const matcher = createTestMatcher(options);

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

    // #737: syntactically valid `%XX` (hex digits) but semantically invalid
    // UTF-8 — `validatePercentEncoding` passes, `decodeURIComponent` throws
    // URIError. `match()` must return undefined, never throw.
    it.each([
      ["%E0%41", "lead byte of a 3-byte seq followed by a non-continuation"],
      ["%C0%80", "overlong encoding of U+0000"],
      ["%FF", "0xFF is never a valid UTF-8 byte"],
      ["%ED%A0%80", "UTF-16 surrogate half (U+D800)"],
      ["a%E0%41b", "invalid sequence embedded in otherwise valid text"],
    ])(
      "should return undefined for valid-hex/invalid-UTF-8 param '%s' (%s)",
      (encoded) => {
        const matcher = createParamMatcher();

        expect(() => matcher.match(`/users/${encoded}`)).not.toThrow();
        expect(matcher.match(`/users/${encoded}`)).toBeUndefined();
      },
    );

    it("should still decode valid multi-byte UTF-8 after the URIError guard", () => {
      const matcher = createParamMatcher();

      // 中 = %E4%B8%AD — proves the try/catch only rejects truly invalid bytes.
      const result = matcher.match("/users/%E4%B8%AD");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "中" });
    });

    it("should NOT reject valid-hex/invalid-UTF-8 when urlParamsEncoding is none", () => {
      // With `none`, decoding is skipped entirely — the raw value passes through
      // and the bytes are never interpreted, so there is nothing to throw.
      const matcher = createParamMatcher({ urlParamsEncoding: "none" });

      const result = matcher.match("/users/%E0%41");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "%E0%41" });
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
      const matcher = createTestMatcher();

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

    // #740 item 2: the trie is greedy — once a segment matches a static child it
    // does NOT backtrack to a param sibling if the rest of the path fails. This
    // is an intentional, documented limitation (INVARIANTS Matching #16).
    it("does NOT backtrack from a static segment to a param sibling (#740)", () => {
      const matcher = createTestMatcher();

      const postsNode = createInputNode({
        name: "posts",
        path: "/posts",
        fullName: "users.profile.posts",
      });
      const profileNode = createInputNode({
        name: "profile",
        path: "/:id",
        fullName: "users.profile",
        children: new Map([["posts", postsNode]]),
        nonAbsoluteChildren: [postsNode],
      });
      const newNode = createInputNode({
        name: "new",
        path: "/new",
        fullName: "users.new",
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

      matcher.registerTree(
        createInputNode({
          name: "",
          path: "",
          fullName: "",
          children: new Map([["users", usersNode]]),
          nonAbsoluteChildren: [usersNode],
        }),
      );

      // Commits to static "new", which has no "/posts" child, and does not
      // retry ":id"="new" → "/posts".
      expect(matcher.match("/users/new/posts")).toBeUndefined();
      // A non-static value reaches the param subtree normally.
      expect(matcher.match("/users/42/posts")?.segments.at(-1)?.fullName).toBe(
        "users.profile.posts",
      );
    });

    it("should return undefined when no param and no static match", () => {
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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

    it("should reject paths with double slashes before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users//123");

      expect(result).toBeUndefined();
    });

    it("should strip hash before param matching", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123#section");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should parse query string and merge with URL params", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123?foo=bar");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123", foo: "bar" });
    });

    it("should return correct meta for param routes", () => {
      const matcher = createParamMatcher();

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        "users.profile": { id: "url" },
      });
    });

    it("should handle slash-child with param parent", () => {
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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

      expect(() => matcher.buildPath("users.profile")).toThrow(
        "[SegmentMatcher.buildPath] Missing required param 'id'",
      );
    });

    it("should throw for explicitly undefined param", () => {
      const matcher = createParamBuildMatcher();

      expect(() =>
        matcher.buildPath("users.profile", { id: undefined }),
      ).toThrow("[SegmentMatcher.buildPath] Missing required param 'id'");
    });

    it("should throw for explicitly null param", () => {
      const matcher = createParamBuildMatcher();

      expect(() => matcher.buildPath("users.profile", { id: null })).toThrow(
        "[SegmentMatcher.buildPath] Missing required param 'id'",
      );
    });

    // #740 item 3: an empty value for a required param silently collapsed the
    // segment (`/users/` → matched the parent), so it is now rejected at build.
    it("should throw for an empty-string required param (#740)", () => {
      const matcher = createParamBuildMatcher();

      expect(() => matcher.buildPath("users.profile", { id: "" })).toThrow(
        "[SegmentMatcher.buildPath] Missing required param 'id' (empty string)",
      );
    });

    it("does NOT reject an empty-string value for an optional param (#740)", () => {
      const matcher = createTestMatcher();
      const search = createInputNode({
        name: "search",
        path: "/search/:q?",
        fullName: "search",
      });

      matcher.registerTree(
        createInputNode({
          name: "",
          path: "",
          fullName: "",
          children: new Map([["search", search]]),
          nonAbsoluteChildren: [search],
        }),
      );

      expect(() => matcher.buildPath("search", { q: "" })).not.toThrow();
    });

    it("should build path with multiple params", () => {
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher({ urlParamsEncoding: "none" });

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
      const matcher = createTestMatcher();

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

    it("should validate constraints in buildPath", () => {
      const matcher = createTestMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: String.raw`/:id<\d+>`,
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

      // Valid
      expect(matcher.buildPath("users.profile", { id: "123" })).toBe(
        "/users/123",
      );

      // Invalid
      expect(() => matcher.buildPath("users.profile", { id: "abc" })).toThrow(
        /does not match constraint/,
      );

      // Object value — serialized via JSON.stringify before constraint check
      expect(() =>
        matcher.buildPath("users.profile", { id: { foo: 1 } }),
      ).toThrow(/does not match constraint/);
    });

    it("should skip constraint validation for undefined optional param", () => {
      const matcher = createTestMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: String.raw`/:id<\d+>?`,
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

      // Optional param with constraint - should not throw when omitted
      expect(matcher.buildPath("users.profile", {})).toBe("/users");
    });

    it("should serialize object params to JSON", () => {
      const matcher = createParamBuildMatcher();

      // Default encoding preserves sub-delimiters like : and ,
      // JSON {"foo":"bar"} → encodeURIComponentExcludingSubDelims
      const result = matcher.buildPath("users.profile", {
        id: { foo: "bar" },
      });

      expect(result).toContain("/users/");
      expect(result).toContain("foo");
      expect(result).toContain("bar");
    });

    it("should serialize array params to JSON", () => {
      const matcher = createParamBuildMatcher();

      // Default encoding preserves commas: [1,2] → %5B1,2%5D
      expect(matcher.buildPath("users.profile", { id: [1, 2] })).toBe(
        "/users/%5B1,2%5D",
      );
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
      const matcher = createTestMatcher();

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

    it("should expose the full ancestor chain via getSegmentsByName on nested routes", () => {
      const { matcher } = createNestedMatcher();

      const usersSegments = matcher.getSegmentsByName("users");
      const profileSegments = matcher.getSegmentsByName("users.profile");
      const settingsSegments = matcher.getSegmentsByName(
        "users.profile.settings",
      );

      // getSegmentsByName returns the ancestor chain: users→1, profile→2, settings→3
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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
    });

    it("should handle slash-child with parent param route", () => {
      const matcher = createTestMatcher();

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
      expect(result!.meta).toStrictEqual({});
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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
      const matcher = createTestMatcher();

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
  // Splat/Wildcard Routes — match
  // ===========================================================================

  describe("match — splat routes", () => {
    function createSplatMatcher(): SegmentMatcher {
      const matcher = createTestMatcher();

      const filesNode = createInputNode({
        name: "files",
        path: "/files/*path",
        fullName: "files",
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
          ["files", filesNode],
        ]),
        nonAbsoluteChildren: [homeNode, filesNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match splat route and capture remaining path", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/docs/readme.md");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("files");
      expect(result!.params).toStrictEqual({ path: "docs/readme.md" });
    });

    it("should match splat route with single segment", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/readme.md");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ path: "readme.md" });
    });

    it("should match splat route with deeply nested path", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/a/b/c/d/e");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ path: "a/b/c/d/e" });
    });

    it("should parse query string with splat matching", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/a/b?dl=true");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ path: "a/b", dl: "true" });
    });

    it("should strip hash before splat matching", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/a/b#section");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ path: "a/b" });
    });

    it("should decode percent-encoded splat values", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/my%20folder/my%20file.txt");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({
        path: "my folder/my file.txt",
      });
    });

    it("should return correct meta for splat route", () => {
      const matcher = createSplatMatcher();

      const result = matcher.match("/files/docs/readme.md");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({
        files: { path: "url" },
      });
    });

    it("should prioritize static over splat", () => {
      const matcher = createTestMatcher();

      const staticChildNode = createInputNode({
        name: "docs",
        path: "/docs",
        fullName: "files.docs",
      });

      const filesNode = createInputNode({
        name: "files",
        path: "/files/*path",
        fullName: "files",
        children: new Map([["docs", staticChildNode]]),
        nonAbsoluteChildren: [staticChildNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["files", filesNode]]),
        nonAbsoluteChildren: [filesNode],
      });

      matcher.registerTree(rootNode);

      // Static "docs" should win over splat
      const staticResult = matcher.match("/files/docs");

      expect(staticResult).toBeDefined();
      expect(staticResult!.segments).toHaveLength(2);
      expect(staticResult!.segments[1].fullName).toBe("files.docs");
      expect(staticResult!.params).toStrictEqual({});

      // Non-static path should fall through to splat
      const splatResult = matcher.match("/files/other/file.txt");

      expect(splatResult).toBeDefined();
      expect(splatResult!.segments[0].fullName).toBe("files");
      expect(splatResult!.params).toStrictEqual({ path: "other/file.txt" });
    });

    it("should prioritize param over splat", () => {
      const matcher = createTestMatcher();

      const paramChildNode = createInputNode({
        name: "item",
        path: "/:id",
        fullName: "files.item",
      });

      const filesNode = createInputNode({
        name: "files",
        path: "/files/*path",
        fullName: "files",
        children: new Map([["item", paramChildNode]]),
        nonAbsoluteChildren: [paramChildNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["files", filesNode]]),
        nonAbsoluteChildren: [filesNode],
      });

      matcher.registerTree(rootNode);

      // Single segment matches param
      const paramResult = matcher.match("/files/123");

      expect(paramResult).toBeDefined();
      expect(paramResult!.segments[1].fullName).toBe("files.item");
      expect(paramResult!.params).toStrictEqual({ id: "123" });

      // Multi-segment matches splat
      const splatResult = matcher.match("/files/a/b/c");

      expect(splatResult).toBeDefined();
      expect(splatResult!.segments[0].fullName).toBe("files");
      expect(splatResult!.params).toStrictEqual({ path: "a/b/c" });
    });

    it("should return undefined when no match at all", () => {
      const matcher = createSplatMatcher();

      expect(matcher.match("/unknown/path")).toBeUndefined();
    });

    it("should handle splat in nested route", () => {
      const matcher = createTestMatcher();

      const catchAllNode = createInputNode({
        name: "catchall",
        path: "/*path",
        fullName: "app.catchall",
      });

      const appNode = createInputNode({
        name: "app",
        path: "/app",
        fullName: "app",
        children: new Map([["catchall", catchAllNode]]),
        nonAbsoluteChildren: [catchAllNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["app", appNode]]),
        nonAbsoluteChildren: [appNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/app/some/deep/path");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("app");
      expect(result!.segments[1].fullName).toBe("app.catchall");
      expect(result!.params).toStrictEqual({ path: "some/deep/path" });
    });

    it("should reject malformed percent encoding in splat", () => {
      const matcher = createSplatMatcher();

      expect(matcher.match("/files/bad%ZZpath")).toBeUndefined();
    });

    it("should return undefined (not throw) for valid-hex/invalid-UTF-8 splat (#737)", () => {
      const matcher = createSplatMatcher();

      expect(() => matcher.match("/files/a/%E0%41")).not.toThrow();
      expect(matcher.match("/files/a/%E0%41")).toBeUndefined();
    });

    it("should handle case-insensitive static + splat", () => {
      const matcher = createTestMatcher({ caseSensitive: false });

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

      const result = matcher.match("/Files/Docs/README.md");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ path: "Docs/README.md" });
    });

    it("should skip decoding splat when urlParamsEncoding is none", () => {
      const matcher = createTestMatcher({ urlParamsEncoding: "none" });

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

      const result = matcher.match("/files/my%20folder/file.txt");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({
        path: "my%20folder/file.txt",
      });
    });
  });

  // ===========================================================================
  // Splat/Wildcard Routes — buildPath
  // ===========================================================================

  describe("buildPath — splat routes", () => {
    it("should build path with splat param preserving /", () => {
      const matcher = createTestMatcher();

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
  });

  // ===========================================================================
  // buildPath — trailing slash options
  // ===========================================================================

  describe("buildPath — trailing slash options", () => {
    it("should add trailing slash when mode is 'always'", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "/home",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("home", {}, { trailingSlash: "always" })).toBe(
        "/home/",
      );
    });

    it("should not double trailing slash when already present", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "/home/",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("home", {}, { trailingSlash: "always" })).toBe(
        "/home/",
      );
    });

    it("should remove trailing slash when mode is 'never'", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "/home/",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("home", {}, { trailingSlash: "never" })).toBe(
        "/home",
      );
    });

    it("should not remove slash from root path '/'", () => {
      const matcher = createTestMatcher();

      const indexNode = createInputNode({
        name: "index",
        path: "/",
        fullName: "index",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["index", indexNode]]),
        nonAbsoluteChildren: [indexNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("index", {}, { trailingSlash: "never" })).toBe(
        "/",
      );
    });

    it("should not modify path without trailingSlash option", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "/home",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("home", {})).toBe("/home");
    });
  });

  // ===========================================================================
  // buildPath — query string options
  // ===========================================================================

  describe("buildPath — query string options", () => {
    it("should include declared query params", () => {
      const matcher = createTestMatcher();

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

      expect(matcher.buildPath("search", { q: "test", page: "2" })).toBe(
        "/search?q=test&page=2",
      );
    });

    it("should omit query params not in params", () => {
      const matcher = createTestMatcher();

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

      expect(matcher.buildPath("search", { q: "hello" })).toBe(
        "/search?q=hello",
      );
    });

    it("should return path without query string when no query params are provided", () => {
      const matcher = createTestMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search?q",
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

    it("should inherit root query params to child routes", () => {
      const matcher = createTestMatcher();

      const usersNode = createInputNode({
        name: "users",
        path: "/users/:id",
        fullName: "users",
      });

      const rootNode = createInputNode({
        name: "",
        path: "?mode",
        fullName: "",
        children: new Map([["users", usersNode]]),
        nonAbsoluteChildren: [usersNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("users", { id: "42", mode: "dev" })).toBe(
        "/users/42?mode=dev",
      );
    });

    it("should add undeclared params as query params in loose mode", () => {
      const matcher = createTestMatcher();

      const usersNode = createInputNode({
        name: "users",
        path: "/users/:id",
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

      expect(
        matcher.buildPath(
          "users",
          { id: "42", extra: "value", another: "one" },
          { queryParamsMode: "loose" },
        ),
      ).toBe("/users/42?extra=value&another=one");
    });

    it("should not add undeclared params in default mode", () => {
      const matcher = createTestMatcher();

      const usersNode = createInputNode({
        name: "users",
        path: "/users/:id",
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

      expect(matcher.buildPath("users", { id: "42", extra: "value" })).toBe(
        "/users/42",
      );
    });

    it("should not duplicate declared query params in loose mode", () => {
      const matcher = createTestMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search?q",
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

      expect(
        matcher.buildPath(
          "search",
          { q: "test", extra: "val" },
          { queryParamsMode: "loose" },
        ),
      ).toBe("/search?q=test&extra=val");
    });

    it("should combine trailing slash and query params", () => {
      const matcher = createTestMatcher();

      const searchNode = createInputNode({
        name: "search",
        path: "/search?q",
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

      expect(
        matcher.buildPath("search", { q: "test" }, { trailingSlash: "always" }),
      ).toBe("/search/?q=test");
    });

    it("should return empty query string when no params given", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "/home",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("home")).toBe("/home");
    });
  });

  // ===========================================================================
  // Absolute Path Routes
  // ===========================================================================

  describe("absolute paths (~prefix)", () => {
    it("should match absolute path from root", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["dashboard", dashboardNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/dashboard");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("admin");
      expect(result!.segments[1].fullName).toBe("admin.dashboard");
    });

    it("should include full ancestor chain in matchSegments", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["dashboard", dashboardNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/dashboard");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("admin");
      expect(result!.segments[1].fullName).toBe("admin.dashboard");
    });

    it("should buildPath for absolute route from root", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["dashboard", dashboardNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("admin.dashboard")).toBe("/dashboard");
    });

    it("should not match absolute route on parent path", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["dashboard", dashboardNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      // Should NOT match at the concatenated parent path
      expect(matcher.match("/app/admin/dashboard")).toBeUndefined();
    });

    it("should handle absolute path with params", () => {
      const matcher = createTestMatcher();

      const detailNode = createInputNode({
        name: "detail",
        path: "~/items/:id",
        fullName: "admin.detail",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["detail", detailNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/items/42");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "42" });
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].fullName).toBe("admin");
      expect(result!.segments[1].fullName).toBe("admin.detail");
    });

    it("should buildPath for absolute route with params", () => {
      const matcher = createTestMatcher();

      const detailNode = createInputNode({
        name: "detail",
        path: "~/items/:id",
        fullName: "admin.detail",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["detail", detailNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.buildPath("admin.detail", { id: "42" })).toBe("/items/42");
    });

    it("should handle order independence — absolute registered first", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const settingsNode = createInputNode({
        name: "settings",
        path: "/settings",
        fullName: "admin.settings",
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([
          ["dashboard", dashboardNode],
          ["settings", settingsNode],
        ]),
        nonAbsoluteChildren: [settingsNode],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.match("/dashboard")).toBeDefined();
      expect(matcher.match("/dashboard")!.segments[1].fullName).toBe(
        "admin.dashboard",
      );
      expect(matcher.match("/app/admin/settings")).toBeDefined();
      expect(matcher.match("/app/admin/settings")!.segments[1].fullName).toBe(
        "admin.settings",
      );
    });

    it("should return correct meta for absolute route", () => {
      const matcher = createTestMatcher();

      const dashboardNode = createInputNode({
        name: "dashboard",
        path: "~/dashboard",
        fullName: "admin.dashboard",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["dashboard", dashboardNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/dashboard");

      expect(result).toBeDefined();
      expect(result!.meta).toStrictEqual({});
    });

    it("should handle absolute root path", () => {
      const matcher = createTestMatcher();

      const homeNode = createInputNode({
        name: "home",
        path: "~/",
        fullName: "admin.home",
        absolute: true,
      });

      const adminNode = createInputNode({
        name: "admin",
        path: "/app/admin",
        fullName: "admin",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [],
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["admin", adminNode]]),
        nonAbsoluteChildren: [adminNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/");

      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[1].fullName).toBe("admin.home");
    });
  });

  // ===========================================================================
  // Slash-Child + Case-Insensitive
  // ===========================================================================

  describe("slash-child — case-insensitive", () => {
    it("should update static cache for slash-child with case-insensitive matching", () => {
      const matcher = createTestMatcher({ caseSensitive: false });

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

  // ===========================================================================
  // Query Parameters
  // ===========================================================================

  describe("match — query parameters", () => {
    function createQueryMatcher(
      options?: Partial<SegmentMatcherOptions>,
    ): SegmentMatcher {
      const matcher = createTestMatcher(options);

      const searchNode = createInputNode({
        name: "search",
        path: "/search?query&page",
        fullName: "search",
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
          ["search", searchNode],
        ]),
        nonAbsoluteChildren: [homeNode, searchNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should include query params in match result (loose mode)", () => {
      const matcher = createQueryMatcher();

      const result = matcher.match("/search?query=hello&page=2");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ query: "hello", page: "2" });
    });

    it("should pass undeclared query params in loose mode", () => {
      const matcher = createQueryMatcher();

      const result = matcher.match("/search?query=hello&extra=yes");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({
        query: "hello",
        extra: "yes",
      });
    });

    it("should reject undeclared query params in strict mode", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      const result = matcher.match("/search?query=hello&unknown=x");

      expect(result).toBeUndefined();
    });

    it("should accept declared query params in strict mode", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      const result = matcher.match("/search?query=hello&page=2");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ query: "hello", page: "2" });
    });

    it("should return empty params when no query string", () => {
      const matcher = createQueryMatcher();

      const result = matcher.match("/search");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({});
    });

    // #1293: search-params materializes a literal "__proto__" query key as a REAL
    // own property (#855). The path-matcher test parser (createTestMatcher) does NOT
    // — a plain assign drops it before the merge — so this local parser reproduces
    // the #855 own-key shape. #mergeQueryParams must then fold the key in with
    // defineProperty, not a plain `params[key] = …` (which hits the inherited
    // "__proto__" setter and silently drops the param one layer up).
    function protoOwnKeyParser(qs: string): Record<string, unknown> {
      const out: Record<string, unknown> = {};

      for (const chunk of qs.split("&")) {
        if (chunk === "") {
          continue;
        }

        const eq = chunk.indexOf("=");
        const key = eq === -1 ? chunk : chunk.slice(0, eq);
        const value = eq === -1 ? null : chunk.slice(eq + 1);

        Object.defineProperty(out, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      return out;
    }

    it("keeps a '__proto__' query key as an own property (#1293)", () => {
      const matcher = createQueryMatcher({
        parseQueryString: protoOwnKeyParser,
      });

      const result = matcher.match("/search?__proto__=zzz");

      expect(Object.hasOwn(result!.params, "__proto__")).toBe(true);
      expect(
        Object.getOwnPropertyDescriptor(result!.params, "__proto__")?.value,
      ).toBe("zzz");
    });

    it("does not pollute Object.prototype via a '__proto__' query key (#1293)", () => {
      const matcher = createQueryMatcher({
        parseQueryString: protoOwnKeyParser,
      });

      matcher.match("/search?__proto__=zzz");

      expect((Object.prototype as Record<string, unknown>).zzz).toBeUndefined();
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    });

    // #737: the injected query parser decodes percent-encoding too, so a
    // valid-hex/invalid-UTF-8 query value makes it throw URIError. match() must
    // honor its never-throw contract — a malformed query → unmatched URL.
    it("should return undefined (not throw) for valid-hex/invalid-UTF-8 query value (#737)", () => {
      const matcher = createQueryMatcher();

      expect(() => matcher.match("/search?query=%E0%41")).not.toThrow();
      expect(matcher.match("/search?query=%E0%41")).toBeUndefined();
    });

    it("should return undefined for invalid-UTF-8 query value in strict mode too (#737)", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      expect(() => matcher.match("/search?query=%C0%80")).not.toThrow();
      expect(matcher.match("/search?query=%C0%80")).toBeUndefined();
    });

    it("should merge URL params with query params", () => {
      const matcher = createTestMatcher();

      const profileNode = createInputNode({
        name: "profile",
        path: "/:id?tab",
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

      const result = matcher.match("/users/123?tab=settings");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123", tab: "settings" });
    });

    it("should use injected parseQueryString function", () => {
      const customParser = (qs: string): Record<string, unknown> => ({
        raw: qs,
      });
      const matcher = createTestMatcher({ parseQueryString: customParser });

      const homeNode = createInputNode({
        name: "home",
        path: "/",
        fullName: "home",
      });

      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["home", homeNode]]),
        nonAbsoluteChildren: [homeNode],
      });

      matcher.registerTree(rootNode);

      const result = matcher.match("/?custom=format");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ raw: "custom=format" });
    });

    it("should handle query string with keys only (no values)", () => {
      const matcher = createQueryMatcher();

      const result = matcher.match("/search?query");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ query: null });
    });

    it("should handle strict mode with no query params on URL", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      const result = matcher.match("/search");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({});
    });

    it("should reject undeclared params via cache in strict mode", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      const result = matcher.match("/search?bad=param");

      expect(result).toBeUndefined();
    });

    it("should accept partial declared params in strict mode", () => {
      const matcher = createQueryMatcher({ strictQueryParams: true });

      const result = matcher.match("/search?query=hello");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ query: "hello" });
    });
  });

  // ===========================================================================
  // Trailing Slash (strict mode)
  // ===========================================================================

  describe("match — strict trailing slash", () => {
    function createStrictSlashMatcher(): SegmentMatcher {
      const matcher = createTestMatcher({ strictTrailingSlash: true });

      const trailingNode = createInputNode({
        name: "trailing",
        path: "/trailing/",
        fullName: "trailing",
      });

      const noTrailingNode = createInputNode({
        name: "notrailing",
        path: "/notrailing",
        fullName: "notrailing",
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
          ["trailing", trailingNode],
          ["notrailing", noTrailingNode],
        ]),
        nonAbsoluteChildren: [homeNode, trailingNode, noTrailingNode],
      });

      matcher.registerTree(rootNode);

      return matcher;
    }

    it("should match route defined with trailing slash when URL has trailing slash", () => {
      const matcher = createStrictSlashMatcher();

      const result = matcher.match("/trailing/");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("trailing");
    });

    it("should reject route defined with trailing slash when URL has no trailing slash", () => {
      const matcher = createStrictSlashMatcher();

      expect(matcher.match("/trailing")).toBeUndefined();
    });

    it("should match route defined without trailing slash when URL has no trailing slash", () => {
      const matcher = createStrictSlashMatcher();

      const result = matcher.match("/notrailing");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("notrailing");
    });

    it("should reject route defined without trailing slash when URL has trailing slash", () => {
      const matcher = createStrictSlashMatcher();

      expect(matcher.match("/notrailing/")).toBeUndefined();
    });

    it("should match root path in strict mode", () => {
      const matcher = createStrictSlashMatcher();

      const result = matcher.match("/");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("home");
    });

    it("should handle strict trailing slash with param routes", () => {
      const matcher = createTestMatcher({ strictTrailingSlash: true });

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

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });

      expect(matcher.match("/users/123/")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Case Sensitivity (extended tests)
  // ===========================================================================

  describe("match — case sensitivity", () => {
    function createCaseInsensitiveMatcher(): SegmentMatcher {
      const matcher = createTestMatcher({ caseSensitive: false });

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

    it("should match uppercase static segment", () => {
      const matcher = createCaseInsensitiveMatcher();

      const result = matcher.match("/USERS");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("users");
    });

    it("should match mixed case static segment", () => {
      const matcher = createCaseInsensitiveMatcher();

      const result = matcher.match("/UsErS");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("users");
    });

    it("should preserve original case in param values", () => {
      const matcher = createCaseInsensitiveMatcher();

      const result = matcher.match("/users/JohnDoe");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "JohnDoe" });
    });

    it("should match case-insensitive static with case-preserving param", () => {
      const matcher = createCaseInsensitiveMatcher();

      const result = matcher.match("/USERS/JohnDoe");

      expect(result).toBeDefined();
      expect(result!.segments[0].fullName).toBe("users");
      expect(result!.params).toStrictEqual({ id: "JohnDoe" });
    });

    it("should reject unknown path in case-sensitive mode", () => {
      const matcher = createTestMatcher({ caseSensitive: true });

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

      expect(matcher.match("/USERS")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Constraint Validation
  // ===========================================================================

  describe("constraint validation", () => {
    it("should match when param satisfies numeric constraint", () => {
      const matcher = createTestMatcher();
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

      const result = matcher.match("/users/123");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "123" });
    });

    it("should reject when param fails numeric constraint", () => {
      const matcher = createTestMatcher();
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

      const result = matcher.match("/users/abc");

      expect(result).toBeUndefined();
    });

    it("should match without constraints (fast path, hasConstraints is false)", () => {
      const matcher = createTestMatcher();
      const userNode = createInputNode({
        name: "user",
        path: "/users/:id",
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

      const result = matcher.match("/users/abc");

      expect(result).toBeDefined();
      expect(result!.params).toStrictEqual({ id: "abc" });
    });

    it("should validate constraint against the DECODED param value (#857)", () => {
      const matcher = createTestMatcher();
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

      // `%33` decodes to "3", which satisfies <\d+>. The constraint describes the
      // logical (decoded) value, so the over-encoded form must match (#857).
      const result = matcher.match("/users/%33");

      expect(result?.params).toStrictEqual({ id: "3" });
    });

    it("should validate multiple constraints on different params", () => {
      const matcher = createTestMatcher();
      const postNode = createInputNode({
        name: "post",
        path: String.raw`/:postId<\d+>`,
        fullName: "user.post",
      });
      const userNode = createInputNode({
        name: "user",
        path: String.raw`/users/:id<\d+>`,
        fullName: "user",
        children: new Map([["post", postNode]]),
        nonAbsoluteChildren: [postNode],
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["user", userNode]]),
        nonAbsoluteChildren: [userNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.match("/users/123/456")).toBeDefined();
      expect(matcher.match("/users/123/456")!.params).toStrictEqual({
        id: "123",
        postId: "456",
      });
      expect(matcher.match("/users/abc/456")).toBeUndefined();
      expect(matcher.match("/users/123/abc")).toBeUndefined();
    });

    it("should match with alpha constraint", () => {
      const matcher = createTestMatcher();
      const slugNode = createInputNode({
        name: "slug",
        path: "/posts/:slug<[a-z-]+>",
        fullName: "slug",
      });
      const rootNode = createInputNode({
        name: "",
        path: "",
        fullName: "",
        children: new Map([["slug", slugNode]]),
        nonAbsoluteChildren: [slugNode],
      });

      matcher.registerTree(rootNode);

      expect(matcher.match("/posts/hello-world")).toBeDefined();
      expect(matcher.match("/posts/hello-world")!.params).toStrictEqual({
        slug: "hello-world",
      });
      expect(matcher.match("/posts/Hello123")).toBeUndefined();
    });
  });
});

// =============================================================================
// Mutation-guard tests — assert OBSERVABLE behavior of paths that 100% line
// coverage exercised but did not pin (mutation survivors). Each kills a specific
// surviving mutant through the public match()/buildPath() surface.
// =============================================================================

describe("mutation guards (observable-behavior kills)", () => {
  function matcherWithRoute(
    path: string,
    options?: Partial<SegmentMatcherOptions>,
  ): SegmentMatcher {
    const matcher = createTestMatcher(options);
    const route = createInputNode({ name: "r", path, fullName: "r" });
    const root = createInputNode({
      name: "",
      path: "",
      fullName: "",
      children: new Map([["r", route]]),
      nonAbsoluteChildren: [route],
    });

    matcher.registerTree(root);

    return matcher;
  }

  it("'none' encoding keeps a raw invalid-percent param value (no decode/validate)", () => {
    // urlParamsEncoding:"none" → #decode === null → #decodeParams short-circuits,
    // so "%zz" is NOT rejected by validatePercentEncoding. Pins the `=== "none"`
    // branch that nulls the decoder.
    const matcher = matcherWithRoute("/:id", { urlParamsEncoding: "none" });

    expect(matcher.match("/%zz")?.params).toStrictEqual({ id: "%zz" });
  });

  it("buildPath reports a missing required param (not a constraint failure) for null", () => {
    // A null value is "absent", so the constraint check must SKIP it and the
    // missing-required-param error must fire — not a constraint-mismatch error.
    const matcher = matcherWithRoute(String.raw`/:id<\d+>`);

    expect(() => matcher.buildPath("r", { id: null })).toThrow(
      "Missing required param 'id'",
    );
  });

  it("buildPath validates an object/array constraint value via JSON.stringify", () => {
    // JSON.stringify([5]) === "[5]" violates <\d+>; String([5]) === "5" would
    // wrongly pass — pins the `typeof === "object" ? JSON.stringify : String`.
    const matcher = matcherWithRoute(String.raw`/:id<\d+>`);

    expect(() => matcher.buildPath("r", { id: [5] })).toThrow(
      "does not match constraint",
    );
  });

  it("default query mode drops undeclared params; loose mode keeps them", () => {
    // Route declares query "q" (so the length===0 fast-return is bypassed).
    // Default mode must ignore "extra"; loose mode must append it but never echo
    // the path param "id" as a query key.
    const matcher = matcherWithRoute("/:id?q");

    expect(matcher.buildPath("r", { id: "5", extra: "x" })).toBe("/5");
    expect(
      matcher.buildPath(
        "r",
        { id: "5", extra: "x" },
        { queryParamsMode: "loose" },
      ),
    ).toBe("/5?extra=x");
  });

  it("rejects a path missing its leading slash (no tail-alignment match)", () => {
    // "hello" lacks a leading "/"; the guard must reject it rather than treat
    // "h" as the slash and match "/ello" on the remaining "ello".
    const matcher = matcherWithRoute("/ello");

    expect(matcher.match("hello")).toBeUndefined();
  });

  it("rejects a path with a U+0080 code point (non-ASCII boundary >= 0x80)", () => {
    // 0x80 is the exact lower bound of the non-ASCII reject; `> 0x80` would admit
    // it, and a non `-2` sentinel would mis-handle it.
    const matcher = matcherWithRoute("/:id");

    expect(matcher.match("/\u0080")).toBeUndefined();
  });

  it("rejects consecutive slashes instead of collapsing them", () => {
    // "//" must be invalid, not silently normalized to "/" (which would match a
    // root route). Pins the prevSlash double-slash detection.
    const matcher = createTestMatcher();
    const home = createInputNode({ name: "home", path: "/", fullName: "home" });

    matcher.registerTree(home);

    expect(matcher.match("/")).toBeDefined();
    expect(matcher.match("//")).toBeUndefined();
  });
});

// =============================================================================
// Mutation guards — registration.ts. Drive registerNode/insertIntoTrie through
// the public registerTree()/match()/buildPath() surface to pin survivors that
// 100% line coverage exercised but did not assert.
// =============================================================================

describe("mutation guards — registration (observable-behavior kills)", () => {
  function rootOf(children: MatcherInputNode[]): MatcherInputNode {
    return createInputNode({
      name: "",
      path: "",
      fullName: "",
      children: new Map(children.map((c) => [c.fullName, c])),
      nonAbsoluteChildren: children,
    });
  }

  // --- error-message text: assert the diagnostic clauses, not just the opener ---
  it("param-name conflict error states the binding rule AND the fix", () => {
    const a = createInputNode({
      name: "ua",
      path: "/user/:id",
      fullName: "ua",
    });
    const b = createInputNode({
      name: "ub",
      path: "/user/:slug",
      fullName: "ub",
    });

    expect(() => {
      createTestMatcher().registerTree(rootOf([a, b]));
    }).toThrow(
      /binds to a single name across every route.*cannot be captured under two names.*Rename one so both routes agree/s,
    );
  });

  it("empty-param-name error explains the match/build disagreement", () => {
    const bare = createInputNode({
      name: "f",
      path: "/files/*",
      fullName: "f",
    });

    expect(() => {
      createTestMatcher().registerTree(rootOf([bare]));
    }).toThrow(
      /must be followed by a name.*capture under an empty key.*the two disagree, so it is rejected/s,
    );
  });

  // --- absolute path: the leading-"~" strip is GUARDED by startsWith("~"); an
  // absolute route whose path lacks "~" must keep its full path (not lose its
  // first char). Kills the `isAbsolute && startsWith("~")` guard mutants. ---
  it("absolute route without a ~ prefix keeps its full path", () => {
    const abs = createInputNode({
      name: "abs",
      path: "/standalone",
      fullName: "p.abs",
      absolute: true,
    });
    const parent = createInputNode({
      name: "p",
      path: "/parent",
      fullName: "p",
      children: new Map([["p.abs", abs]]),
      nonAbsoluteChildren: [],
    });

    const matcher = createTestMatcher();

    matcher.registerTree(rootOf([parent]));

    expect(matcher.match("/standalone")).toBeDefined();
    expect(matcher.match("/standalone")?.segments.at(-1)?.fullName).toBe(
      "p.abs",
    );
  });

  // --- slash-child (child whose path resolves to the parent's): must register
  // in the slashChildRoute slot + build to the parent path. ---
  it("slash-child route matches the parent path and builds back to it", () => {
    const idx = createInputNode({ name: "idx", path: "", fullName: "sec.idx" });
    const sec = createInputNode({
      name: "sec",
      path: "/section",
      fullName: "sec",
      children: new Map([["sec.idx", idx]]),
      nonAbsoluteChildren: [idx],
    });

    const matcher = createTestMatcher();

    matcher.registerTree(rootOf([sec]));

    const r = matcher.match("/section");

    expect(r).toBeDefined();
    expect(r?.segments.at(-1)?.fullName).toBe("sec.idx");
    expect(matcher.buildPath("sec.idx")).toBe("/section");
    expect(matcher.buildPath("sec")).toBe("/section");
  });
});
