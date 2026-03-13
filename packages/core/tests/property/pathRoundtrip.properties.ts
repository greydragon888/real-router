import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getPluginApi } from "@real-router/core";

import {
  createFixtureRouter,
  arbIdParam,
  arbSearchParams,
  normalizeParams,
  NUM_RUNS,
} from "./helpers";

describe("buildPath ↔ matchPath Roundtrip Properties", () => {
  const router = createFixtureRouter();
  const pluginApi = getPluginApi(router);

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "roundtrip: matchPath(buildPath(name, params)).name === name",
    (params) => {
      const path = router.buildPath("users.view", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("users.view");
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "params preserved through roundtrip (with string coercion)",
    (params) => {
      const path = router.buildPath("users.view", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(normalizeParams(matched!.params)).toStrictEqual(
        normalizeParams(params),
      );
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
    "query params roundtrip: search route preserves q and page",
    (params) => {
      const path = router.buildPath("search", params);
      const matched = pluginApi.matchPath(path);

      expect(matched).toBeDefined();
      expect(matched!.name).toBe("search");
      expect(matched!.params.q).toBe(params.q);
      expect(matched!.params.page).toBe(params.page);
    },
  );

  it("buildPath with no params uses defaults for static routes", () => {
    const path = router.buildPath("home");

    expect(path).toBe("/");
  });
});
