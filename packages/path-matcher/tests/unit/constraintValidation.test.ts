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
    }).not.toThrow();
  });

  it("throws error for non-matching constraint", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    expect(() => {
      validateConstraints({ id: "abc" }, patterns, String.raw`/users/:id<\d+>`);
    }).toThrow(
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
    }).not.toThrow();

    expect(() => {
      validateConstraints(
        { id: "abc", slug: "my-post" },
        patterns,
        String.raw`/:id<\d+>/:slug<[a-z-]+>`,
      );
    }).toThrow(String.raw`expected to match '\d+'`);
  });

  it("handles empty constraint pattern map", () => {
    const patterns = new Map<string, ConstraintPattern>();

    expect(() => {
      validateConstraints({ id: "anything" }, patterns, "/users/:id");
    }).not.toThrow();
  });

  it("shows default pattern for empty constraint", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^([^/]+)$/, constraint: "" }],
    ]);

    expect(() => {
      validateConstraints({ id: "/" }, patterns, "/users/:id");
    }).toThrow("expected to match '[^/]+'");
  });

  it("coerces non-string param values to string before testing", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    // Number 42 becomes "42" which matches \d+
    expect(() => {
      validateConstraints(
        { id: 42 as unknown },
        patterns,
        String.raw`/users/:id<\d+>`,
      );
    }).not.toThrow();

    // Boolean true becomes "true" which does not match \d+
    expect(() => {
      validateConstraints(
        { id: true as unknown },
        patterns,
        String.raw`/users/:id<\d+>`,
      );
    }).toThrow(String.raw`expected to match '\d+'`);
  });

  it("coerces undefined param to string 'undefined' for constraint check", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    expect(() => {
      validateConstraints(
        { id: undefined as unknown },
        patterns,
        String.raw`/users/:id<\d+>`,
      );
    }).toThrow("got 'undefined'");
  });

  it("validates only params present in constraint map, ignores extra params", () => {
    const patterns = new Map<string, ConstraintPattern>([
      ["id", { pattern: /^(\d+)$/, constraint: String.raw`<\d+>` }],
    ]);

    // "extra" param has no constraint — should not affect validation
    expect(() => {
      validateConstraints(
        { id: "123", extra: "anything-goes" },
        patterns,
        String.raw`/users/:id<\d+>`,
      );
    }).not.toThrow();
  });

  it("strips angle brackets from constraint in error message", () => {
    const patterns = new Map<string, ConstraintPattern>([
      [
        "slug",
        { pattern: /^([a-z][a-z0-9-]*)$/, constraint: "<[a-z][a-z0-9-]*>" },
      ],
    ]);

    expect(() => {
      validateConstraints(
        { slug: "123Invalid" },
        patterns,
        "/posts/:slug<[a-z][a-z0-9-]*>",
      );
    }).toThrow("expected to match '[a-z][a-z0-9-]*'");
  });
});
