// #1407: a route path WITHOUT a leading "/" (a relative segment, or an absolute
// `~foo` written without the slash) must be normalized at the createNode boundary
// — after the `~`-strip, a non-empty path that doesn't start with "/" gets one
// prepended. Before the fix these forms were silently mis-registered as dead
// routes (buildPath emits a URL its own match rejects) or threw a cryptic
// "Empty parameter name" from a supposedly-unreachable trie branch. The gate
// (`validateRoutePath`) already documents relative segments and `~path` as VALID,
// so normalize (not reject) makes that contract true. See INVARIANTS.md
// "Leading-slash normalization".

import { describe, expect, it } from "vitest";

import { createMatcher, createRouteTree } from "../../../src/engine";

describe("#1407 leading-slash normalization at createNode", () => {
  // ── α: absolute written without the slash (`~foo`, pre-existing) ──────────
  it("normalizes a `~foo` absolute route to `/foo` (round-trips)", () => {
    const matcher = createMatcher();

    matcher.registerTree(createRouteTree("r", "~dashboard", []));

    expect(matcher.buildPath("r", {})).toBe("/dashboard");
    expect(matcher.match("/dashboard")?.segments.at(-1)?.name).toBe("r");
  });

  it("leaves a conventional `~/foo` absolute route unchanged", () => {
    const matcher = createMatcher();

    matcher.registerTree(
      createRouteTree("", "", [
        {
          name: "admin",
          path: "/admin",
          children: [{ name: "dash", path: "~/dashboard" }],
        },
      ]),
    );

    expect(matcher.buildPath("admin.dash", {})).toBe("/dashboard");
    expect(matcher.match("/dashboard")?.segments.at(-1)?.name).toBe("dash");
  });

  // ── β: a marker-starting child fused onto a static-ending parent ──────────
  it("separates a no-slash param child from its parent (no cross-node fusion)", () => {
    const tree = createRouteTree("", "", [
      { name: "a", path: "/a", children: [{ name: "b", path: ":id" }] },
    ]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    // Before the fix: buildFullPath("/a", ":id") === "/a:id" — the param fused
    // across the boundary, buildPath dropped `id`, and match("/a/X") failed.
    expect(matcher.buildPath("a.b", { id: "X" })).toBe("/a/X");
    expect(matcher.match("/a/X")?.segments.at(-1)?.name).toBe("b");
  });

  it("separates a no-slash static child from its parent", () => {
    const tree = createRouteTree("", "", [
      { name: "a", path: "/a", children: [{ name: "b", path: "foo" }] },
    ]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    // Before the fix: buildFullPath("/a", "foo") === "/afoo" (a dead route).
    expect(matcher.buildPath("a.b", {})).toBe("/a/foo");
    expect(matcher.match("/a/foo")?.segments.at(-1)?.name).toBe("b");
  });

  it("still round-trips the conventional `/:id` child (control)", () => {
    const tree = createRouteTree("", "", [
      { name: "a", path: "/a", children: [{ name: "b", path: "/:id" }] },
    ]);
    const matcher = createMatcher();

    matcher.registerTree(tree);

    expect(matcher.buildPath("a.b", { id: "X" })).toBe("/a/X");
    expect(matcher.match("/a/X")?.segments.at(-1)?.name).toBe("b");
  });

  // ── #2: a relative path ending in a bare marker (`a:`) ───────────────────
  it("registers a `a:` route as the static `/a:` instead of throwing", () => {
    const matcher = createMatcher();

    // Before the fix: the trie scanned from index 1, dropped the `a`, saw `:`,
    // and threw "Empty parameter name" from the false-`unreachable` branch.
    expect(() => {
      matcher.registerTree(createRouteTree("r", "a:", []));
    }).not.toThrow();

    expect(matcher.buildPath("r", {})).toBe("/a:");
    expect(matcher.match("/a:")?.segments.at(-1)?.name).toBe("r");
  });

  // ── relative top-level route ─────────────────────────────────────────────
  it("normalizes a relative top-level `foo` route to `/foo`", () => {
    const matcher = createMatcher();

    matcher.registerTree(createRouteTree("", "", [{ name: "r", path: "foo" }]));

    expect(matcher.buildPath("r", {})).toBe("/foo");
    expect(matcher.match("/foo")?.segments.at(-1)?.name).toBe("r");
  });

  // ── query-only path (`?q`) has no path segment to slash; a relative segment
  //    carrying a query (`foo?q`) still gets its leading slash ────────────────
  it("leaves a query-only `?q` path unslashed but slashes a `foo?q` segment", () => {
    const matcher = createMatcher();

    matcher.registerTree(
      createRouteTree("", "", [
        { name: "root", path: "?globalParam" },
        { name: "rel", path: "foo?q" },
      ]),
    );

    // `?globalParam` root: query-only, no leading segment — stays a root match.
    expect(matcher.buildPath("root", {})).toBe("");
    // `foo?q`: the `foo` segment is slashed, the query is preserved.
    expect(matcher.buildPath("rel", {})).toBe("/foo");
    expect(matcher.match("/foo")?.segments.at(-1)?.name).toBe("rel");
  });

  // ── no-op cases (leading `/`, empty root) stay identical ─────────────────
  it("leaves a leading-`/` route and empty grouping node unchanged", () => {
    const matcher = createMatcher();

    matcher.registerTree(
      createRouteTree("", "", [
        { name: "g", path: "", children: [{ name: "u", path: "/users" }] },
      ]),
    );

    expect(matcher.buildPath("g.u", {})).toBe("/users");
    expect(matcher.match("/users")?.segments.at(-1)?.name).toBe("u");
  });
});
