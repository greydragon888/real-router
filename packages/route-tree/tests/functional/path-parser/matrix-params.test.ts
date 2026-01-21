/**
 * Matrix parameters tests.
 *
 * Tests for matching and building paths with matrix parameters.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../src/parser/path-parser";

describe("Path matrix parameters", () => {
  const path = new Path("/users/;section;id");

  it("should detect matrix params", () => {
    expect(path.hasMatrixParams).toBe(true);
  });

  it("should build with matrix parameters", () => {
    expect(path.build({ section: "profile", id: "123" })).toBe(
      "/users/;section=profile;id=123",
    );
  });

  it("should match matrix parameters", () => {
    expect(path.test("/users/;section=profile;id=123")).toStrictEqual({
      section: "profile",
      id: "123",
    });
  });
});
