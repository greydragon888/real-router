import { describe, expect, it } from "vitest";

import {
  buildParamMeta,
  findSegmentGrammarError,
} from "../../../../src/engine/path-matcher";
import { createMatcher } from "../../helpers/buildTree";

/**
 * PUBLIC-CONTRACT unit tests for the segment tokenizer (#1324).
 *
 * The tokenizer (`parseSegment` / `splitPathSegments`) is INTERNAL — these tests
 * exercise it only through the surface a CONSUMER actually observes, so every green
 * assertion is a real guarantee (white-box audit; see `packages/path-matcher/eslint.config.mjs`):
 *   - `findSegmentGrammarError(path)` — the validation entry route-tree's gate calls
 *     (returns the exact rejection code);
 *   - `buildParamMeta(path)` — the metadata a consumer reads (names / splat / constraints);
 *   - `createMatcher([...]).match(...)` — runtime behaviour (optional take/omit,
 *     constraint filtering, static / splat matching).
 *
 * The INTERNAL token-tuple equivalence (`parseSegment` ≡ the parsers, exact tuples /
 * exact segment arrays) is pinned separately in the exempt
 * `tests/property/parseSegment.properties.ts` (gate 2) — that is its own, deliberate
 * white-box channel, not this file's job.
 */

const meta = (path: string): ReturnType<typeof buildParamMeta> =>
  buildParamMeta(path);
const mk = (path: string): ReturnType<typeof createMatcher> =>
  createMatcher([{ name: "r", path }]);

describe("accepted segment shapes (buildParamMeta + match behaviour)", () => {
  describe("static", () => {
    it("a plain static carries no param and matches literally", () => {
      expect(meta("/users").urlParams).toStrictEqual([]);
      expect(mk("/users").match("/users")?.params).toStrictEqual({});
    });

    it("a hyphen/dot static literal", () => {
      expect(meta("/a-b.c").urlParams).toStrictEqual([]);
      expect(mk("/a-b.c").match("/a-b.c")?.params).toStrictEqual({});
    });

    it("a bare marker at the END of a static stays a literal (F2 — not a fused param)", () => {
      // `/ab:` / `/ab*` are valid static literals, not params — no name follows the
      // marker. The gate accepts them, and the matcher registers + matches them as
      // literals while buildParamMeta reports no param.
      for (const p of ["/ab:", "/ab*"]) {
        expect(findSegmentGrammarError(p)).toBeUndefined();
        expect(meta(p).urlParams).toStrictEqual([]);
        expect(mk(p).match(p)?.params).toStrictEqual({});
      }
    });

    it("`//` / leading / trailing empties never invent a phantom param", () => {
      // Empty segments tokenize as static, so double/leading/trailing slashes carry
      // no param (and are not a grammar error at the tokenizer level).
      expect(findSegmentGrammarError("/a//b/")).toBeUndefined();
      expect(meta("/a//b/").urlParams).toStrictEqual([]);
    });
  });

  describe("param / splat", () => {
    it("a bare param — name extracted, single-segment match", () => {
      expect(meta("/:id").urlParams).toStrictEqual(["id"]);
      expect(meta("/:id").spatParams).toStrictEqual([]);
      expect(mk("/:id").match("/joe")?.params).toStrictEqual({ id: "joe" });
    });

    it("a param name may contain a hyphen", () => {
      expect(meta("/:my-param").urlParams).toStrictEqual(["my-param"]);
    });

    it("a splat — captured as a multi-segment value", () => {
      expect(meta("/*rest").spatParams).toStrictEqual(["rest"]);
      expect(mk("/*rest").match("/a/b")?.params).toStrictEqual({ rest: "a/b" });
    });

    it("a constrained param — constraint recorded AND filters the match", () => {
      expect(
        meta(String.raw`/:id<\d+>`).constraintPatterns.get("id")?.constraint,
      ).toBe(String.raw`<\d+>`);

      const m = mk(String.raw`/:id<\d+>`);

      expect(m.match("/5")?.params).toStrictEqual({ id: "5" });
      expect(m.match("/abc")).toBeUndefined(); // constraint rejects non-digits
    });

    it("an optional param — matches BOTH the take and the omit form", () => {
      // `optional` is observable only as runtime behaviour: the route resolves WITH
      // and WITHOUT the segment. (buildParamMeta exposes no `optional` field —
      // asserting one would pin an internal shape.)
      const m = mk("/users/:id?");

      expect(m.match("/users/5")?.params).toStrictEqual({ id: "5" }); // take
      expect(m.match("/users")?.params).toStrictEqual({}); // omit
    });

    it("a constrained + optional param — both signals together", () => {
      const path = String.raw`/users/:id<\d+>?`;

      expect(meta(path).constraintPatterns.get("id")?.constraint).toBe(
        String.raw`<\d+>`,
      );

      const m = mk(path);

      expect(m.match("/users/5")?.params).toStrictEqual({ id: "5" });
      expect(m.match("/users")?.params).toStrictEqual({}); // omit works
    });
  });

  describe("mid-marker names are preserved (#1324 boundary)", () => {
    it("a `:`/`*` INSIDE the name stays a name char, not a rejection", () => {
      // `:a:b` → param named `a:b`; only a marker STARTING the segment or ENDING the
      // name is special, an interior one is an ordinary name char.
      expect(findSegmentGrammarError("/:a:b")).toBeUndefined();
      expect(meta("/:a:b").urlParams).toStrictEqual(["a:b"]);
      expect(mk("/:a:b").match("/x")?.params).toStrictEqual({ "a:b": "x" });

      expect(findSegmentGrammarError("/:a*b")).toBeUndefined();
      expect(meta("/:a*b").urlParams).toStrictEqual(["a*b"]);
    });
  });

  describe("§8 behaviour-preservation edges", () => {
    it("a lazy `?` INSIDE a constraint is not the optional marker (param stays required)", () => {
      const path = String.raw`/x/:id<\d?>`;

      expect(meta(path).constraintPatterns.get("id")?.constraint).toBe(
        String.raw`<\d?>`,
      );

      const m = mk(path);

      expect(m.match("/x")).toBeUndefined(); // required — the `?` did NOT make it optional
      expect(m.match("/x/5")?.params).toStrictEqual({ id: "5" });
    });

    it("a constraint's lazy `?` PLUS a trailing optional `?`", () => {
      const path = String.raw`/x/:id<\d?>?`;

      expect(meta(path).constraintPatterns.get("id")?.constraint).toBe(
        String.raw`<\d?>`,
      );

      const m = mk(path);

      expect(m.match("/x/5")?.params).toStrictEqual({ id: "5" });
      expect(m.match("/x")?.params).toStrictEqual({}); // the OUTER `?` IS the optional marker
    });

    it("`/a:?b` — the `?` is the query separator, `a:` a static literal", () => {
      // A `?` in a route path starts the query (not a mid-segment char): "/a:?b" is
      // the static "a:" with a query param "b" — the honest reading a consumer gets.
      const m = meta("/a:?b");

      expect(m.pathPattern).toBe("/a:");
      expect(m.queryParams).toStrictEqual(["b"]);
      expect(m.urlParams).toStrictEqual([]);
    });
  });
});

describe("rejected segment shapes (findSegmentGrammarError — the gate's entry)", () => {
  it("name-less marker (#858)", () => {
    for (const p of ["/x/:", "/x/*", "/x/:?", String.raw`/x/:<\d+>`]) {
      expect(findSegmentGrammarError(p)).toBe("name-less");
    }
  });

  it("an optional modifier on a marker-less segment is name-less (#1241, `/faq?`)", () => {
    for (const p of ["/faq?", "/a-b?", "/x/?"]) {
      expect(findSegmentGrammarError(p)).toBe("name-less");
    }
  });

  it("a trailing marker fused to a name (#1324)", () => {
    for (const p of ["/x/:y*", "/x/:y:", "/x/*y*", "/x/*y:"]) {
      expect(findSegmentGrammarError(p)).toBe("trailing-marker");
    }

    // end-to-end: the registration backstop rejects it too
    expect(() => mk("/x/:y*")).toThrow(/Trailing parameter marker/u);
  });

  it("a marker fused after a static prefix (#1050)", () => {
    for (const p of ["/a:b", "/a*b", "/users:id"]) {
      expect(findSegmentGrammarError(p)).toBe("fused-marker");
    }
  });

  it("static text fused to a constraint's `>` (#1150)", () => {
    for (const p of [
      String.raw`/:year<\d+>-archive`,
      String.raw`/:id<\d+>.html`,
    ]) {
      expect(findSegmentGrammarError(p)).toBe("fused-constraint-suffix");
    }
  });

  it("a constraint in a marker-less static segment (#1311)", () => {
    for (const p of ["/foo<bar>", "/a<b>"]) {
      expect(findSegmentGrammarError(p)).toBe("constraint-in-static");
    }
  });

  it("an optional splat (#1149)", () => {
    expect(findSegmentGrammarError("/files/*path?")).toBe("optional-splat");
    // end-to-end: the registration backstop rejects it too
    expect(() => mk("/files/*path?")).toThrow(/Optional splat/u);
  });

  it("an unbalanced / empty constraint (#804)", () => {
    expect(findSegmentGrammarError(String.raw`/:id<\d+`)).toBe(
      "unbalanced-constraint",
    );
    expect(findSegmentGrammarError("/:id<>")).toBe("empty-constraint");
  });
});

describe("constraint-aware path segmentation (buildParamMeta + match)", () => {
  it("splits on `/` outside constraints — every param extracted in order", () => {
    expect(meta("/users/:id/posts/:pid").urlParams).toStrictEqual([
      "id",
      "pid",
    ]);
  });

  it("does NOT split on `/` INSIDE a `<...>` constraint (body may hold `/`)", () => {
    // Observable guarantee: the constraint body keeps its `/`, so the segment was not
    // broken at it — and the surrounding statics stay statics.
    expect(meta("/:v<a|b/c>").constraintPatterns.get("v")?.constraint).toBe(
      "<a|b/c>",
    );
    expect(meta("/x/:id<a/b>/y").constraintPatterns.get("id")?.constraint).toBe(
      "<a/b>",
    );
    expect(meta("/x/:id<a/b>/y").urlParams).toStrictEqual(["id"]);
  });

  it("first-`>` semantics — `/` splits again after the constraint closes", () => {
    const path = String.raw`/:id<\d+>/y`;

    expect(meta(path).urlParams).toStrictEqual(["id"]); // only :id is a param; y is static
    expect(meta(path).constraintPatterns.get("id")?.constraint).toBe(
      String.raw`<\d+>`,
    );
    expect(mk(path).match("/5/y")?.params).toStrictEqual({ id: "5" });
  });
});

describe("findSegmentGrammarError (validation entry over the tokenizer)", () => {
  it("returns undefined for a clean path (incl. constraint-with-`/`)", () => {
    expect(
      findSegmentGrammarError(String.raw`/users/:id<\d+>/posts/:pid?`),
    ).toBeUndefined();
    expect(findSegmentGrammarError("/x/:id<a/b>/y")).toBeUndefined();
    expect(findSegmentGrammarError("/")).toBeUndefined();
  });

  it("returns the FIRST error left-to-right across malformed segments", () => {
    // "a:b" (fused-marker) precedes ":y*" (trailing-marker) → fused-marker wins.
    expect(findSegmentGrammarError("/a:b/:y*")).toBe("fused-marker");
  });
});
