/**
 * Tests for meta operations.
 */

import { describe, it, expect } from "vitest";

import { createRouteTree } from "../../../src/builder/createRouteTree";
import {
  buildParamTypeMap,
  getMetaFromSegments,
} from "../../../src/operations/meta";
import { getSegmentsByName } from "../../../src/operations/query";

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

  it("buildParamTypeMap should map url params correctly", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id/:action" },
    ]);

    const userRoute = tree.childrenByName.get("users")!;
    const result = buildParamTypeMap(userRoute.parser);

    expect(result).toStrictEqual({
      id: "url",
      action: "url",
    });
  });

  it("buildParamTypeMap should map query params correctly", () => {
    const tree = createRouteTree("", "", [
      { name: "search", path: "/search?q&page&sort" },
    ]);

    const searchRoute = tree.childrenByName.get("search")!;
    const result = buildParamTypeMap(searchRoute.parser);

    expect(result).toStrictEqual({
      q: "query",
      page: "query",
      sort: "query",
    });
  });

  it("buildParamTypeMap should map mixed url and query params", () => {
    const tree = createRouteTree("", "", [
      { name: "users", path: "/users/:id?tab&view" },
    ]);

    const userRoute = tree.childrenByName.get("users")!;
    const result = buildParamTypeMap(userRoute.parser);

    expect(result).toStrictEqual({
      id: "url",
      tab: "query",
      view: "query",
    });
  });
});
