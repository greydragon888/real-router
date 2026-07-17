import { describe, expect, it } from "vitest";

import { isConstraintBalanced } from "../../../src/path-matcher";

// `CONSTRAINT_BODY_PATTERN` (the `<...>` body atom) is an internal single-source
// grammar atom — no longer re-exported from the package index (#1505). Its value
// and grammar (the canonical `*` quantifier, empty `<>` admitted) are locked in
// `tests/property/constraint-grammar.properties.ts`, which imports it from src
// (exempt from the white-box guardrail) and kills the `[^>]+` mutant via the empty
// `<>` discriminator.
describe("constraint-grammar (#804)", () => {
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
