import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * SUPPORT-NARROWER for an optional param directly followed by a dynamic segment
 * (#1263/#1264). Part A1: **constrained optional → splat** — `try-take-if-valid`.
 *
 * The constraint disambiguates: take the segment as the optional only if it
 * satisfies the constraint on the DECODED value (#857), else skip and let the
 * splat capture the remainder. Before this, the omit form was UNMATCHABLE
 * (`buildPath` emitted a dead deep-link) — the constrained-optional part of #1264.
 */
describe("optional-successor binding — A1: constrained-opt → splat (#1264)", () => {
  describe("numeric-constrained /:v — take vs skip by constraint", () => {
    const versioned = () =>
      createMatcher([{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }]);

    it("works under 'none' encoding — raw segment, no inline-decode", () => {
      const m = createMatcher(
        [{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }],
        { urlParamsEncoding: "none" },
      );

      expect(m.match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
      expect(m.match("/users")?.params).toStrictEqual({ rest: "users" });
    });

    it("TAKES the optional when the first segment satisfies the constraint", () => {
      expect(versioned().match("/v1/users")?.params).toStrictEqual({
        v: "v1",
        rest: "users",
      });
    });

    it("SKIPS the optional when the first segment fails the constraint (omit form)", () => {
      // was UNMATCH — the dead deep-link of #1264
      expect(versioned().match("/users")?.params).toStrictEqual({
        rest: "users",
      });
    });

    it("skips over a multi-segment remainder", () => {
      expect(versioned().match("/docs/install/guide")?.params).toStrictEqual({
        rest: "docs/install/guide",
      });
    });
  });

  describe("decode-edge: the take-decision validates the DECODED segment (#857)", () => {
    it("takes an over-encoded segment whose DECODED form satisfies the constraint", () => {
      // %76%31 decodes to "v1" — raw "%76%31" fails `v\d+`, decoded "v1" passes.
      expect(
        createMatcher([
          { name: "r", path: String.raw`/:v<v\d+>?/*rest` },
        ]).match("/%76%31/users")?.params,
      ).toStrictEqual({ v: "v1", rest: "users" });
    });

    it("a malformed-percent first segment is UNMATCH, never a throw (#737)", () => {
      // decode throws → the segment can't be the optional → skip → splat captures
      // it raw → #decodeParams rejects the malformed value → UNMATCH.
      const m = createMatcher([
        { name: "r", path: String.raw`/:v<v\d+>?/*rest` },
      ]);

      expect(() => m.match("/%zz/users")).not.toThrow();
      expect(m.match("/%zz/users")).toBeUndefined();
    });
  });

  describe("alternation constraint (preview-mode) + collision canonicalization", () => {
    const modal = () =>
      createMatcher([{ name: "r", path: "/:mode<(preview|draft)>?/*path" }]);

    it("skips when the first segment is outside the constraint language", () => {
      expect(modal().match("/docs/install")?.params).toStrictEqual({
        path: "docs/install",
      });
    });

    it("takes when the first segment matches the mode", () => {
      expect(modal().match("/preview/docs/install")?.params).toStrictEqual({
        mode: "preview",
        path: "docs/install",
      });
    });

    it("on a collision (first segment IS a valid mode) take-first is canonical", () => {
      // `/draft/notes` is ambiguous ({path:"draft/notes"} vs {mode:"draft",path:"notes"});
      // the non-injective splat build (#18) canonicalizes to the take interpretation.
      expect(modal().match("/draft/notes")?.params).toStrictEqual({
        mode: "draft",
        path: "notes",
      });
    });
  });

  describe("no regression for the fork mechanism's neighbours", () => {
    it("a plain constrained param still matches / rejects normally", () => {
      const m = createMatcher([{ name: "r", path: String.raw`/u/:id<\d+>` }]);

      expect(m.match("/u/42")?.params).toStrictEqual({ id: "42" });
      expect(m.match("/u/abc")).toBeUndefined();
    });

    it("a plain splat still greedily captures", () => {
      expect(
        createMatcher([{ name: "r", path: "/files/*rest" }]).match(
          "/files/a/b/c",
        )?.params,
      ).toStrictEqual({ rest: "a/b/c" });
    });
  });
});

/**
 * Part A2: an optional param directly followed by a REQUIRED param (`/:a?/:b`,
 * #1263). Disambiguated by segment count — the omit form is one segment shorter,
 * so on the LAST segment the optional is omitted and the segment binds under the
 * SUCCESSOR's name (not the optional's, the wrong-name bug). The optional's own
 * constraint (if any) is validated post-traverse when the optional is present.
 */
describe("optional-successor binding — A2: opt → required param (#1263)", () => {
  describe("unconstrained /:a?/:b — segment count drives the binding", () => {
    const tenant = () => createMatcher([{ name: "r", path: "/:a?/:b" }]);

    it("omit form: a single segment binds under the SUCCESSOR name, not the optional's", () => {
      // was {a:"users"} — the wrong-name bug of #1263
      expect(tenant().match("/users")?.params).toStrictEqual({ b: "users" });
    });

    it("present form: two segments bind both params", () => {
      expect(tenant().match("/admin/users")?.params).toStrictEqual({
        a: "admin",
        b: "users",
      });
    });

    it("an over-long path (3 segments) does not match a 2-param route", () => {
      expect(tenant().match("/a/b/c")).toBeUndefined();
    });
  });

  describe("numeric-constrained optional before a required param", () => {
    const route = () =>
      createMatcher([{ name: "r", path: String.raw`/:a<\d+>?/:b` }]);

    it("omit form ignores the optional's constraint (it is absent)", () => {
      // `users` fails `\d+`, but the optional is omitted → the constraint never applies
      expect(route().match("/users")?.params).toStrictEqual({ b: "users" });
    });

    it("present form validates the optional's constraint", () => {
      expect(route().match("/42/users")?.params).toStrictEqual({
        a: "42",
        b: "users",
      });
    });

    it("present form with a constraint-violating optional is UNMATCH", () => {
      // `p` fails `\d+`; skip would leave `x` extra → neither interpretation valid
      expect(route().match("/p/x")).toBeUndefined();
    });
  });

  describe("constrained required successor", () => {
    const route = () =>
      createMatcher([{ name: "r", path: String.raw`/:a?/:b<\d+>` }]);

    it("omit form validates the successor's constraint on the bound value", () => {
      expect(route().match("/42")?.params).toStrictEqual({ b: "42" });
      expect(route().match("/users")).toBeUndefined();
    });

    it("present form binds a and validates b's constraint", () => {
      expect(route().match("/admin/42")?.params).toStrictEqual({
        a: "admin",
        b: "42",
      });
    });
  });

  describe("opt+opt is left as documented (out of SUPPORT-NARROWER scope)", () => {
    it("consecutive optionals still reuse one position (present-first)", () => {
      const m = createMatcher([{ name: "r", path: "/:a?/:b?/d" }]);

      expect(m.match("/d")?.params).toStrictEqual({});
      expect(m.match("/p/q/d")?.params).toStrictEqual({ a: "p", b: "q" });
    });
  });
});

/**
 * Part B: an UNCONSTRAINED optional before a splat (`/:v?/*rest`, #1264) is
 * REJECTED at registration with a hint (reject-with-hint, #1149 style). Without a
 * constraint there is no validity signal to disambiguate take vs skip — every
 * multi-segment value has two readings, so support would silently reshape half the
 * input space. A CONSTRAINED optional→splat is supported (A1).
 */
describe("optional-successor binding — B: reject unconstrained opt → splat (#1264)", () => {
  it("throws at registration with a hint to add a constraint", () => {
    expect(() => createMatcher([{ name: "r", path: "/:v?/*rest" }])).toThrow(
      /must be constrained/,
    );
    expect(() => createMatcher([{ name: "r", path: "/:lang?/*path" }])).toThrow(
      /Add a constraint/,
    );
  });

  it("does NOT reject a CONSTRAINED optional before a splat (that is A1)", () => {
    expect(() =>
      createMatcher([{ name: "r", path: String.raw`/:v<v\d+>?/*rest` }]),
    ).not.toThrow();
  });

  it("does NOT reject a required splat or an optional before a static/param", () => {
    expect(() =>
      createMatcher([{ name: "r", path: "/files/*rest" }]),
    ).not.toThrow();
    expect(() => createMatcher([{ name: "r", path: "/:a?/:b" }])).not.toThrow();
    expect(() =>
      createMatcher([{ name: "r", path: "/:lang?/home" }]),
    ).not.toThrow();
  });
});
