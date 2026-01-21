/**
 * Tests for absolute paths.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";
import { buildPath } from "../../../src/operations/build";

describe("New API - absolute paths", () => {
  it("should handle absolute paths", () => {
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [
          { name: "relative", path: "/relative" },
          { name: "absolute", path: "~/absolute" },
        ],
      },
    ]);

    expect(buildPath(tree, "parent.relative")).toBe("/parent/relative");
    expect(buildPath(tree, "parent.absolute")).toBe("/absolute");
  });

  it("should match absolute paths", () => {
    const tree = createRouteTree("", "", [
      {
        name: "parent",
        path: "/parent",
        children: [{ name: "absolute", path: "~/absolute" }],
      },
    ]);

    const result = matchPath(tree, "/absolute");

    expect(result?.name).toBe("parent.absolute");
  });
});
