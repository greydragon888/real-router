/**
 * Tests for query operations (getSegmentsByName, hasSegmentsByName).
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../src/builder/createRouteTree";
import {
  getSegmentsByName,
  hasSegmentsByName,
} from "../../../src/operations/query";

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

  it("hasSegmentsByName should return true for existing route", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
      },
    ]);

    expect(hasSegmentsByName(tree, "users")).toBe(true);
    expect(hasSegmentsByName(tree, "users.profile")).toBe(true);
  });

  it("hasSegmentsByName should return false for non-existent route", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    expect(hasSegmentsByName(tree, "nonexistent")).toBe(false);
    expect(hasSegmentsByName(tree, "home.missing")).toBe(false);
  });

  it("hasSegmentsByName should handle empty route name", () => {
    const tree = createRouteTree("", "", [{ name: "home", path: "/home" }]);

    // Empty string means we're looking for a child with empty name
    // which doesn't exist in the tree
    expect(hasSegmentsByName(tree, "")).toBe(false);
  });

  it("hasSegmentsByName should be consistent with getSegmentsByName", () => {
    const tree = createRouteTree("", "", [
      {
        name: "app",
        path: "/app",
        children: [
          { name: "dashboard", path: "/dashboard" },
          { name: "settings", path: "/settings" },
        ],
      },
    ]);

    const testCases = [
      "app",
      "app.dashboard",
      "app.settings",
      "nonexistent",
      "app.missing",
    ];

    for (const name of testCases) {
      const hasResult = hasSegmentsByName(tree, name);
      const getResult = getSegmentsByName(tree, name);

      expect(hasResult).toBe(getResult !== null);
    }
  });
});
