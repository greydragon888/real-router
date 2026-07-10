import { describe, expect, it } from "vitest";

import { CONSTRAINT_BODY_PATTERN, isConstraintBalanced } from "path-matcher";

describe("constraint-grammar (#804)", () => {
  describe("CONSTRAINT_BODY_PATTERN", () => {
    it("is the canonical `*`-quantified body atom", () => {
      expect(CONSTRAINT_BODY_PATTERN).toBe("[^>]*");
    });

    it("derives a regex that matches a `<...>` delimiter pair (incl. empty)", () => {
      const rgx = new RegExp(`<${CONSTRAINT_BODY_PATTERN}>`);

      expect(rgx.test(String.raw`<\d+>`)).toBe(true);
      expect(rgx.test("<[a-z]+>")).toBe(true);
      // canonical `*` admits the empty body at the grammar level (rejected
      // later at the gate/backstop, not here).
      expect(rgx.test("<>")).toBe(true);
      expect(rgx.test("no-delimiters")).toBe(false);
    });
  });

  describe("isConstraintBalanced", () => {
    it("returns true for paths with no delimiters", () => {
      expect(isConstraintBalanced("/users/:id")).toBe(true);
      expect(isConstraintBalanced("")).toBe(true);
    });

    it("returns true for a well-formed constraint", () => {
      expect(isConstraintBalanced(String.raw`/users/:id<\d+>`)).toBe(true);
      expect(isConstraintBalanced(String.raw`/q/:id<\d?>`)).toBe(true);
    });

    it("allows a `<` inside the constraint body (first `>` closes)", () => {
      expect(isConstraintBalanced("/:id<[a<b]>")).toBe(true);
    });

    it("treats the empty `<>` as balanced (semantic rejection is elsewhere)", () => {
      expect(isConstraintBalanced("/:id<>")).toBe(true);
    });

    it("returns false for an unclosed `<`", () => {
      expect(isConstraintBalanced(String.raw`/:id<\d+`)).toBe(false);
      expect(isConstraintBalanced("/:id<")).toBe(false);
      expect(isConstraintBalanced("<a><b")).toBe(false);
      expect(isConstraintBalanced("a<b>c<")).toBe(false);
    });

    it("returns false for a stray `>` with no open `<`", () => {
      expect(isConstraintBalanced("a>b")).toBe(false);
      expect(isConstraintBalanced("><")).toBe(false);
    });

    it("returns false for a nested-open double delimiter `<<>>`", () => {
      // first `<` opens, second `<` is inside the body, first `>` closes, the
      // trailing `>` is then stray → unbalanced.
      expect(isConstraintBalanced("<<>>")).toBe(false);
    });
  });
});
