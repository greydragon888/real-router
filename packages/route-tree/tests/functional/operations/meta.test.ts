/**
 * Tests for meta operations.
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../modules/builder/createRouteTree";
import {
  buildParamTypeMap,
  getMetaFromSegments,
} from "../../../modules/operations/meta";
import { getSegmentsByName } from "../../../modules/operations/query";

describe("New API - meta functions", () => {
  it("getMetaFromSegments should build meta from segments", () => {
    const tree = createRouteTree("", "", [
      {
        name: "users",
        path: "/users?sort",
        children: [{ name: "profile", path: "/:id?tab" }],
      },
    ]);

    const segments = getSegmentsByName(tree, "users.profile");
    const meta = getMetaFromSegments(segments!);

    expect(meta.users).toStrictEqual({ sort: "query" });
    expect(meta["users.profile"]).toStrictEqual({ id: "url", tab: "query" });
  });

  it("buildParamTypeMap should return empty for null parser", () => {
    const result = buildParamTypeMap(null);

    expect(result).toStrictEqual({});
  });
});
