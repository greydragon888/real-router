import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  arbIdParam,
  arbSearchParams,
  NUM_RUNS,
} from "./helpers";

describe("buildPath ↔ matchPath Roundtrip Properties", () => {
  const router = createFixtureRouter();
  const pluginApi = getPluginApi(router);

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "roundtrip: matchPath(buildPath(name, params)) preserves name and params",
    (params) => {
      const path = router.buildPath("users.view", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("users.view");
      // Path params are always strings after URL decode
      expect(matched!.params).toStrictEqual({ id: params.id });
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "buildPath always starts with /",
    (params) => {
      const path = router.buildPath("users.view", params);

      expect(path.startsWith("/")).toBe(true);
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "determinism: same args produce same path",
    (params) => {
      const path1 = router.buildPath("users.view", params);
      const path2 = router.buildPath("users.view", params);

      expect(path1).toBe(path2);
    },
  );

  test.prop([arbSearchParams], { numRuns: NUM_RUNS.standard })(
    "query params roundtrip: search route preserves q and page values",
    (params) => {
      const path = router.buildPath("search", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("search");

      // numberFormat: "auto" converts canonical numeric strings to numbers.
      // Roundtrip preserves VALUE but may change TYPE (string→number).
      const q = matched!.params.q as string | number;
      const page = matched!.params.page as string | number;

      expect(`${q}`).toBe(params.q);
      expect(`${page}`).toBe(params.page);
    },
  );

  it("buildPath with no params uses defaults for static routes", () => {
    const path = router.buildPath("home");

    expect(path).toBe("/");
  });
});
