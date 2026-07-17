import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * #1288 — validated sub-traverse. A branch candidate (splat's specific child,
 * and — part 2 — a param branch at a param+splat junction) commits only when it
 * structurally completes AND its route's constraints hold on the decoded scratch
 * values; otherwise the wildcard/splat sibling captures. Closes the
 * constraint-blind fallback family: a post-traverse constraint failure used to
 * kill the WHOLE match even though the fallback interpretation was valid.
 */
describe("validated sub-traverse — #matchSplat specific child (#24 blind spot)", () => {
  const blob = () =>
    createMatcher([
      {
        name: "blob",
        path: "/files/*any",
        children: [{ name: "kid", path: String.raw`/:id<\d+>` }],
      },
    ]);

  it("a specific child whose constraint HOLDS still wins over the wildcard", () => {
    const r = blob().match("/files/5");

    expect(r?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(r?.params).toStrictEqual({ id: "5" });
  });

  it("a structurally-complete child whose constraint FAILS falls back to the wildcard (was UNMATCH)", () => {
    // buildPath("blob", {any:"xx"}) emits "/files/xx" — before the fix its own
    // match rejected it: the specific branch won structurally, then died in
    // post-traverse constraint validation where no fallback exists.
    const m = blob();

    expect(m.buildPath("blob", { any: "xx" })).toBe("/files/xx");

    const r = m.match("/files/xx");

    expect(r?.segments.at(-1)?.fullName).toBe("blob");
    expect(r?.params).toStrictEqual({ any: "xx" });
  });

  it("validates the branch constraint on the DECODED value (#857)", () => {
    // %35 decodes to "5" — the raw form fails \d+, the decoded form passes.
    const r = blob().match("/files/%35");

    expect(r?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(r?.params).toStrictEqual({ id: "5" });
  });

  it("an undecodable candidate value falls back to the wildcard, then UNMATCHes in decode (#737)", () => {
    // decode("%zz") throws → the specific branch cannot hold → wildcard captures
    // the raw segment → #decodeParams rejects it. Same observable result as
    // before (UNMATCH), reached through the fallback instead of a dead commit.
    const m = blob();

    expect(() => m.match("/files/%zz")).not.toThrow();
    expect(m.match("/files/%zz")).toBeUndefined();
  });

  it("a multi-segment remainder keeps the wildcard capture (structural miss unchanged)", () => {
    expect(blob().match("/files/a/b")?.params).toStrictEqual({ any: "a/b" });
  });

  it("skips a constrained param ABSENT from the branch scratch (omitted optional, #1148)", () => {
    // kid's optional :id<\d+>? is omitted on "/files/tail" — its constraint must
    // not be tested against a missing value inside the candidate check.
    const m = createMatcher([
      {
        name: "blob",
        path: "/files/*any",
        children: [{ name: "kid", path: String.raw`/:id<\d+>?/tail` }],
      },
    ]);

    const omit = m.match("/files/tail");

    expect(omit?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(omit?.params).toStrictEqual({});

    const present = m.match("/files/7/tail");

    expect(present?.params).toStrictEqual({ id: "7" });
  });

  it("under 'none' encoding the branch constraint tests the raw segment", () => {
    const m = createMatcher(
      [
        {
          name: "blob",
          path: "/files/*any",
          children: [{ name: "kid", path: String.raw`/:id<\d+>` }],
        },
      ],
      { urlParamsEncoding: "none" },
    );

    expect(m.match("/files/7")?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(m.match("/files/xx")?.params).toStrictEqual({ any: "xx" });
  });
});

/**
 * #1288 part 2 — the param+splat junction. The param branch commits only when it
 * can COMPLETE (structurally + its route's constraints); otherwise the splat
 * sibling captures. Uniform INVARIANTS #8 rule ("param wins if its branch can
 * complete"), subsuming the former constraint-fail-only fallback (#1266) and the
 * last-segment dead-end (#1283).
 */
describe("validated sub-traverse — param+splat junction (#1288)", () => {
  describe("structural dead-end past a constraint-passing take", () => {
    const routes = () =>
      createMatcher([
        { name: "all", path: "/*rest" },
        { name: "ver", path: String.raw`/:v<v\d+>/edit` },
      ]);

    it("a completing param branch still wins", () => {
      const r = routes().match("/v1/edit");

      expect(r?.segments.at(-1)?.fullName).toBe("ver");
      expect(r?.params).toStrictEqual({ v: "v1" });
    });

    it("a branch that dead-ends BELOW the junction falls to the catch-all (was UNMATCH)", () => {
      // "v1" satisfies the constraint, the branch then has nowhere to put
      // "nope" — before the fix the traversal committed and died, leaving
      // buildPath("all", {rest:"v1/nope"}) a dead deep-link.
      const m = routes();

      expect(m.buildPath("all", { rest: "v1/nope" })).toBe("/v1/nope");
      expect(m.match("/v1/nope")?.params).toStrictEqual({ rest: "v1/nope" });
    });

    it("a constraint-failing first segment falls to the catch-all (the #1266 fast-reject)", () => {
      expect(routes().match("/x/nope")?.params).toStrictEqual({
        rest: "x/nope",
      });
    });
  });

  describe("deep constraint dead-end (a constraint BELOW the junction fails)", () => {
    const routes = () =>
      createMatcher([
        { name: "all", path: "/*rest" },
        { name: "ver", path: String.raw`/:v<v\d+>/:id<\d+>` },
      ]);

    it("both constraints hold → the specific route wins", () => {
      expect(routes().match("/v1/42")?.params).toStrictEqual({
        v: "v1",
        id: "42",
      });
    });

    it("a deeper constraint failing lets the catch-all capture (was UNMATCH)", () => {
      expect(routes().match("/v1/abc")?.params).toStrictEqual({
        rest: "v1/abc",
      });
    });
  });

  describe("multi-constraint slot (#1284 disjunction) — the branch validates the REACHED route", () => {
    const routes = () =>
      createMatcher([
        { name: "num", path: String.raw`/user/:id<\d+>/a` },
        { name: "hex", path: "/user/:id<[a-f]+>/b" },
        { name: "all", path: "/user/*rest" },
      ]);

    it("each sibling route matches its own constraint language", () => {
      expect(routes().match("/user/42/a")?.segments.at(-1)?.fullName).toBe(
        "num",
      );
      expect(routes().match("/user/abc/b")?.segments.at(-1)?.fullName).toBe(
        "hex",
      );
    });

    it("a disjunction-passing value whose REACHED route's constraint fails falls to the catch-all (was UNMATCH)", () => {
      // "abc" passes the composite (hex side), but the /a tail reaches `num`,
      // whose \d+ fails — the branch must fall back, not kill the match.
      expect(routes().match("/user/abc/a")?.params).toStrictEqual({
        rest: "abc/a",
      });
      expect(routes().match("/user/42/b")?.params).toStrictEqual({
        rest: "42/b",
      });
    });

    it("a value outside every constraint falls to the catch-all", () => {
      expect(routes().match("/user/zzz/x")?.params).toStrictEqual({
        rest: "zzz/x",
      });
    });
  });

  describe("UNCONSTRAINED param + splat sibling (the former INVARIANTS #8 greedy carve-out)", () => {
    const routes = () =>
      createMatcher([
        { name: "prof", path: "/user/:id/profile" },
        { name: "all", path: "/user/*rest" },
      ]);

    it("a completing param branch wins (greedy preserved for the happy path)", () => {
      const r = routes().match("/user/x/profile");

      expect(r?.segments.at(-1)?.fullName).toBe("prof");
      expect(r?.params).toStrictEqual({ id: "x" });
    });

    it("a dead-ending branch falls to the catch-all — no constraint needed (was UNMATCH)", () => {
      expect(routes().match("/user/x/settings")?.params).toStrictEqual({
        rest: "x/settings",
      });
      expect(routes().match("/user/x")?.params).toStrictEqual({ rest: "x" });
    });
  });

  describe("A2 rename fork sharing a junction with a foreign catch-all", () => {
    const routes = () =>
      createMatcher([
        { name: "pair", path: "/:a?/:b" },
        { name: "all", path: "/*rest" },
      ]);

    it("the omit form still binds under the successor's name through the sub-traverse", () => {
      expect(routes().match("/x")?.params).toStrictEqual({ b: "x" });
      expect(routes().match("/x/y")?.params).toStrictEqual({ a: "x", b: "y" });
    });

    it("an overflowing path falls to the catch-all (was UNMATCH)", () => {
      const r = routes().match("/x/y/z");

      expect(r?.segments.at(-1)?.fullName).toBe("all");
      expect(r?.params).toStrictEqual({ rest: "x/y/z" });
    });
  });

  describe("junction with a TERMINAL param node (present-first preserved)", () => {
    const routes = () =>
      createMatcher([
        { name: "one", path: String.raw`/files/:id<\d+>` },
        { name: "all", path: "/files/*rest" },
      ]);

    it("a terminal single-segment take wins over the splat", () => {
      const r = routes().match("/files/7");

      expect(r?.segments.at(-1)?.fullName).toBe("one");
      expect(r?.params).toStrictEqual({ id: "7" });
    });

    it("a constraint-failing single segment goes to the splat", () => {
      expect(routes().match("/files/xx")?.params).toStrictEqual({
        rest: "xx",
      });
    });

    it("a multi-segment remainder overflows the single-param route into the splat (was UNMATCH)", () => {
      expect(routes().match("/files/7/x")?.params).toStrictEqual({
        rest: "7/x",
      });
    });
  });

  describe("deep junction chain (combinatorial guard — correctness, no timing)", () => {
    const N = 32;

    function chain() {
      // level i: /:vI<x\d+> continuing + a /*restI splat sibling — the worst-case
      // shape for nested sub-traverses (the spike measured ~N², no exponent).
      interface Def {
        name: string;
        path: string;
        children?: Def[];
      }
      let child: Def = {
        name: `p${String(N)}`,
        path: String.raw`/:v${String(N)}<x\d+>`,
        children: [{ name: `r${String(N)}`, path: `/*rest${String(N)}` }],
      };

      for (let i = N - 1; i >= 1; i--) {
        child = {
          name: `p${String(i)}`,
          path: String.raw`/:v${String(i)}<x\d+>`,
          children: [
            child,
            { name: `r${String(i)}`, path: `/*rest${String(i)}` },
          ],
        };
      }

      return createMatcher([child]);
    }

    function takeSegments(count: number): string {
      const segs = Array.from({ length: count }, (_, i) => `x${String(i + 1)}`);

      return `/${segs.join("/")}`;
    }

    it("a full take-all path binds every level", () => {
      const m = chain();
      const r = m.match(takeSegments(N));

      expect(r).toBeDefined();
      expect(Object.keys(r!.params)).toHaveLength(N);
    });

    it("a failure at the bottom falls back LOCALLY to the deepest splat (no cascade)", () => {
      // 31 take segments land on node p31, whose junction is v32 + rest31 —
      // "yy" fast-rejects v32's constraint and is captured by THAT level's
      // splat, not by any shallower one (the fallback is local).
      const m = chain();
      const r = m.match(`${takeSegments(N - 1)}/yy`);

      expect(r?.segments.at(-1)?.fullName).toContain(`r${String(N - 1)}`);
      expect(r?.params[`rest${String(N - 1)}`]).toBe("yy");
    });
  });
});
