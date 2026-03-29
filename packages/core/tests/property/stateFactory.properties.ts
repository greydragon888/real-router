import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createFixtureRouter, arbIdParam, NUM_RUNS } from "./helpers";

describe("buildState / makeState Properties", () => {
  const router = createFixtureRouter();
  const pluginApi = getPluginApi(router);

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "buildState + makeState path matches buildPath",
    (params) => {
      const result = pluginApi.buildState("users.view", params);
      const path = router.buildPath("users.view", params);

      expect(result).toBeDefined();

      const buildStateResult = result!;
      const state = pluginApi.makeState(
        buildStateResult.name,
        buildStateResult.params,
        path,
        {
          params: buildStateResult.meta,
        },
      );

      expect(state.path).toBe(path);
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "buildState.name equals the requested route name",
    (params) => {
      const result = pluginApi.buildState("users.view", params);

      expect(result).toBeDefined();
      expect(result!.name).toBe("users.view");
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "makeState returns a frozen state",
    (params) => {
      const path = router.buildPath("users.view", params);
      const state = pluginApi.makeState("users.view", params, path);

      expect(Object.isFrozen(state)).toBe(true);
    },
  );

  test.prop([arbIdParam], { numRuns: NUM_RUNS.standard })(
    "makeState determinism: same args produce structurally equal states (except id)",
    (params) => {
      const path = router.buildPath("users.view", params);
      const s1 = pluginApi.makeState("users.view", params, path);
      const s2 = pluginApi.makeState("users.view", params, path);

      expect(s1.name).toBe(s2.name);
      expect(s1.path).toBe(s2.path);
      expect(s1.params).toStrictEqual(s2.params);
    },
  );
});
