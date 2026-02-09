/**
 * Tests for absolute paths.
 */

import { describe, it, expect } from "vitest";

import { matchPath } from "./helpers";
import { createRouteTree } from "../../../src/builder/createRouteTree";

describe("New API - absolute paths", () => {
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

  it("should compute staticPath for child of absolute route", () => {
    const tree = createRouteTree("", "", [
      {
        name: "admin",
        path: "/admin",
        children: [
          {
            name: "dashboard",
            path: "~/dashboard",
            children: [{ name: "stats", path: "/stats" }],
          },
        ],
      },
    ]);

    // Child of an absolute route should have correct staticPath
    const result = matchPath(tree, "/dashboard/stats");

    expect(result?.name).toBe("admin.dashboard.stats");
  });
});
