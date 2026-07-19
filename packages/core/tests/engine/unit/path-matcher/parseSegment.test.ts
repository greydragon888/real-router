import { describe, expect, it } from "vitest";

import {
  buildParamMeta,
  findSegmentGrammarError,
} from "../../../../src/engine/path-matcher";
import { createMatcher } from "../../helpers/buildTree";

/**
 * PUBLIC-CONTRACT unit tests for the segment tokenizer (3-token grammar, M1:
 * `static | :param | *splat` — optional `:x?` and `<re>` constraints removed).
 *
 * The tokenizer (`parseSegment` / `splitPathSegments`) is INTERNAL — these tests
 * exercise it only through the surface a CONSUMER actually observes:
 *   - `findSegmentGrammarError(path)` — the validation entry route-tree's gate calls
 *     (returns the exact rejection code);
 *   - `buildParamMeta(path)` — the metadata a consumer reads (names / splat);
 *   - `createMatcher([...]).match(...)` — runtime behaviour (static / param / splat)
 *     and the registration backstop (which throws on a removed form).
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

  describe("query separator `?` disambiguation (M1 §3.3)", () => {
    it("`/:id?format` — the `?` starts the query (param `id` + query `format`)", () => {
      const m = meta("/:id?format");

      expect(m.pathPattern).toBe("/:id");
      expect(m.urlParams).toStrictEqual(["id"]);
      expect(m.queryParams).toStrictEqual(["format"]);
    });

    it("`/a:?b` — the `?` is the query separator, `a:` a static literal", () => {
      const m = meta("/a:?b");

      expect(m.pathPattern).toBe("/a:");
      expect(m.queryParams).toStrictEqual(["b"]);
      expect(m.urlParams).toStrictEqual([]);
    });

    it("`/?role` — a query on the root path", () => {
      const m = meta("/?role");

      expect(m.pathPattern).toBe("/");
      expect(m.queryParams).toStrictEqual(["role"]);
    });
  });
});

describe("removed forms — optional `:x?` (M1)", () => {
  it("a trailing `?` on a param is `optional-removed`", () => {
    for (const p of ["/:id?", "/users/:id?", "/:id?/edit"]) {
      expect(findSegmentGrammarError(p)).toBe("optional-removed");
    }
  });

  it("an optional splat `*x?` is `optional-removed` (was #1149)", () => {
    expect(findSegmentGrammarError("/files/*path?")).toBe("optional-removed");
  });

  it("a reverse-order `?` before a former constraint keeps the optional reading", () => {
    // `/:id??tab` — the LATER `?` is the query separator, the leading `?` an
    // optional; `/a/:b?<x>` — the `<` tail keeps the `?` an optional. Neither
    // silently becomes a query declaration.
    expect(findSegmentGrammarError("/:id??tab")).toBe("optional-removed");
    expect(findSegmentGrammarError("/a/:b?<x>")).toBe("optional-removed");
  });

  it("the registration backstop rejects it with the optional recipe", () => {
    expect(() => mk("/users/:id?")).toThrow(
      /Optional params are not supported/u,
    );
  });

  it("a trailing `?` on a MARKER-LESS segment is still name-less (#1241, `/faq?`)", () => {
    for (const p of ["/faq?", "/a-b?", "/x/?"]) {
      expect(findSegmentGrammarError(p)).toBe("name-less");
    }
  });
});

describe("removed forms — regex constraints `<re>` (M1)", () => {
  it("a `<...>` on a param is `constraint-removed`", () => {
    for (const p of [
      String.raw`/:id<\d+>`,
      String.raw`/users/:id<\d+>`,
      String.raw`/:id<\d+>?`, // constrained + optional → the `<` is hit first
      String.raw`/:year<\d+>-archive`, // was fused-constraint-suffix (#1150)
    ]) {
      expect(findSegmentGrammarError(p)).toBe("constraint-removed");
    }
  });

  it("a `<...>` in a marker-less static segment is `constraint-removed` (was #1311)", () => {
    for (const p of ["/foo<bar>", "/a<b>"]) {
      expect(findSegmentGrammarError(p)).toBe("constraint-removed");
    }
  });

  it("an unbalanced / empty `<>` is `constraint-removed` (was #804)", () => {
    expect(findSegmentGrammarError(String.raw`/:id<\d+`)).toBe(
      "constraint-removed",
    );
    expect(findSegmentGrammarError("/:id<>")).toBe("constraint-removed");
  });

  it("a stray `>` alone is `constraint-removed` (В1.3: reserved delimiter)", () => {
    expect(findSegmentGrammarError("/a>b")).toBe("constraint-removed");
  });

  it("the registration backstop rejects it with the constraint recipe", () => {
    expect(() => mk(String.raw`/:id<\d+>`)).toThrow(
      /Regex constraints are not supported/u,
    );
  });
});

describe("surviving rejections (findSegmentGrammarError — the gate's entry)", () => {
  it("name-less marker (#858)", () => {
    for (const p of ["/x/:", "/x/*", "/x/:?", String.raw`/x/:<\d+>`]) {
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
});

describe("path segmentation (buildParamMeta + match)", () => {
  it("splits on `/` — every param extracted in order", () => {
    expect(meta("/users/:id/posts/:pid").urlParams).toStrictEqual([
      "id",
      "pid",
    ]);
    expect(
      mk("/users/:id/posts/:pid").match("/users/5/posts/7")?.params,
    ).toStrictEqual({ id: "5", pid: "7" });
  });
});

describe("findSegmentGrammarError (validation entry over the tokenizer)", () => {
  it("returns undefined for a clean 3-token path (incl. query)", () => {
    expect(findSegmentGrammarError("/users/:id/posts/:pid")).toBeUndefined();
    expect(findSegmentGrammarError("/x/*rest")).toBeUndefined();
    expect(findSegmentGrammarError("/")).toBeUndefined();
  });

  it("returns the FIRST error left-to-right across malformed segments", () => {
    // "a:b" (fused-marker) precedes ":y*" (trailing-marker) → fused-marker wins.
    expect(findSegmentGrammarError("/a:b/:y*")).toBe("fused-marker");
  });
});
