/**
 * Path instantiation tests.
 *
 * Tests for Path class constructor and factory methods.
 */

import { describe, it, expect } from "vitest";

import { Path } from "../../../modules/parser/path-parser";

describe("Path instantiation", () => {
  it("should throw an error when instantiated without parameter", () => {
    expect(() => new Path("")).toThrowError("Missing path in Path constructor");
  });

  it("should throw an error if Path is used like a function", () => {
    // @ts-expect-error - testing runtime behavior
    const pathAsFunction = Path as () => Path;

    expect(() => pathAsFunction()).toThrowError();
  });

  it("should throw an error if a path cannot be tokenised", () => {
    expect(() => new Path("/!#")).toThrowError();
  });

  it("should return a path if createPath is used", () => {
    expect(Path.createPath("/users")).toBeDefined();
  });

  it("should create path with basic pattern", () => {
    const path = new Path("/users");

    expect(path.path).toBe("/users");
  });

  it("should detect URL parameters", () => {
    const path = new Path("/users/:id");

    expect(path.hasUrlParams).toBe(true);
    expect(path.urlParams).toStrictEqual(["id"]);
  });

  it("should detect query parameters", () => {
    const path = new Path("/users?offset&limit");

    expect(path.hasQueryParams).toBe(true);
    expect(path.queryParams).toStrictEqual(["offset", "limit"]);
  });

  it("should detect splat parameters", () => {
    const path = new Path("/users/*splat");

    expect(path.hasSpatParam).toBe(true);
    expect(path.spatParams).toStrictEqual(["splat"]);
  });

  it("should detect matrix parameters", () => {
    const path = new Path("/users/;section;id");

    expect(path.hasMatrixParams).toBe(true);
  });
});
