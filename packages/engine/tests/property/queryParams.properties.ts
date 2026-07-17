// packages/route-tree/tests/property/queryParams.properties.ts

import { test } from "@fast-check/vitest";

import { arbQueryParamNames, NUM_RUNS } from "./helpers";
import { createRouteTree } from "../../src/builder/createRouteTree";

describe("Query Param Extraction Properties (getQueryParamsMeta equivalent)", () => {
  describe("extraction — query params in path are present in paramMeta.queryParams (high)", () => {
    test.prop([arbQueryParamNames], { numRuns: NUM_RUNS.thorough })(
      "all param names declared in the path appear in paramMeta.queryParams",
      (paramNames: string[]) => {
        const path = `/base?${paramNames.join("&")}`;
        const tree = createRouteTree("", "", [{ name: "r", path }]);
        const node = tree.children.get("r")!;

        expect(node).toBeDefined();
        expect(node.paramMeta.queryParams).toStrictEqual(paramNames);
        expect(node.paramMeta.queryParams).toHaveLength(paramNames.length);
      },
    );
  });

  describe("separation — pathPattern does not contain the query string (high)", () => {
    test.prop([arbQueryParamNames], { numRuns: NUM_RUNS.thorough })(
      "paramMeta.pathPattern contains only the URL path, not the query string",
      (paramNames: string[]) => {
        const path = `/base?${paramNames.join("&")}`;
        const tree = createRouteTree("", "", [{ name: "r", path }]);
        const node = tree.children.get("r")!;

        expect(node).toBeDefined();
        expect(node.paramMeta.pathPattern).not.toContain("?");
        expect(node.paramMeta.pathPattern).toBe("/base");
      },
    );
  });
});
