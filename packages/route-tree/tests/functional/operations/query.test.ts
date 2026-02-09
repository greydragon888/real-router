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
});
