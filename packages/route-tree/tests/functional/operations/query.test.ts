/**
 * Tests for query operations (getSegmentsByName).
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../src/builder/createRouteTree";
import { getSegmentsByName } from "../../../src/operations/query";

describe("New API - query functions", () => {
  it("getSegmentsByName should return segments", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    const segments = getSegmentsByName(tree, "users.profile");

    expect(segments).toHaveLength(2);
    expect(segments![0].name).toBe("users");
    expect(segments![1].name).toBe("profile");
  });

  it("getSegmentsByName should return null for non-existent route", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    const segments = getSegmentsByName(tree, "nonexistent");

    expect(segments).toBeNull();
  });

  it("getSegmentsByName should return segments for nested route with query params", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "search", path: "/search?q&page" }],
      },
    ]);

    const segments = getSegmentsByName(tree, "users.search");

    expect(segments).toHaveLength(2);
    expect(segments![0].name).toBe("users");
    expect(segments![1].name).toBe("search");
  });

  it("getSegmentsByName should return segments for root with empty path and query params", () => {
    const tree = createRouteTree("", "?lang", [
      { name: "home", path: "/home" },
    ]);

    const segments = getSegmentsByName(tree, "home");

    // Root with parser should be included as first segment
    expect(segments).toHaveLength(2);
    expect(segments![0]).toBe(tree);
    expect(segments![1].name).toBe("home");
  });

  it("getSegmentsByName should return segments for route with multiple query params", () => {
    const tree = createRouteTree("", "", [
      { name: "search", path: "/search?q&page&sort&order" },
    ]);

    const segments = getSegmentsByName(tree, "search");

    expect(segments).toHaveLength(1);
    expect(segments![0].name).toBe("search");
    expect(segments![0].path).toBe("/search?q&page&sort&order");
  });
});
