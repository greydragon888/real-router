import { describe, it, expect } from "vitest";

import { validateConstraints } from "../../src/constraintValidation";

import type { ConstraintPattern } from "../../src/types";

describe("validateConstraints", () => {
  it("passes validation for matching constraint", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    expect(() => {
      validateConstraints({ id: "123" }, patterns, String.raw`/users/:id<\d+>`);
    }).not.toThrowError();
  });

  it("throws error for non-matching constraint", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    expect(() => {
      validateConstraints({ id: "abc" }, patterns, String.raw`/users/:id<\d+>`);
    }).toThrowError(
      String.raw`[validateConstraints] Parameter 'id' of '/users/:id<\d+>' has invalid format: got 'abc', expected to match '\d+'`,
    );
  });

  it("validates multiple constraints", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
      ["slug", { pattern: /^([a-z-]+)$/, constraint: "<[a-z-]+>" }],
    ]);

    expect(() => {
      validateConstraints(
        { id: "123", slug: "my-post" },
        patterns,
        String.raw`/:id<\d+>/:slug<[a-z-]+>`,
      );
    }).not.toThrowError();

    expect(() => {
      validateConstraints(
        { id: "abc", slug: "my-post" },
        patterns,
        String.raw`/:id<\d+>/:slug<[a-z-]+>`,
      );
    }).toThrowError(String.raw`expected to match '\d+'`);
  });

  it("handles empty constraint pattern map", () => {
    const patterns = new Map<string, ConstraintPattern>();

    expect(() => {
      validateConstraints({ id: "anything" }, patterns, "/users/:id");
    }).not.toThrowError();
  });

  it("shows default pattern for empty constraint", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^([^/]+)$/, constraint: "" }],
    ]);

    expect(() => {
      validateConstraints({ id: "/" }, patterns, "/users/:id");
    }).toThrowError("expected to match '[^/]+'");
  });
});
