import { fc, test } from "@fast-check/vitest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartedRouter, arbFixtureRoute, NUM_RUNS } from "./helpers";

import type { Router } from "@real-router/core";

describe("isActiveRoute Properties", () => {
  let router: Router;

  beforeAll(async () => {
    router = await createStartedRouter("/users/abc");
  });

  afterAll(() => {
    router.stop();
  });

  it("current route with its params is always active", () => {
    const state = router.getState()!;

    expect(router.isActiveRoute(state.name, state.params)).toBe(true);
  });

  it("current route with exact params is active (strictEquality)", () => {
    const state = router.getState()!;

    expect(router.isActiveRoute(state.name, state.params, true)).toBe(true);
  });

  it("ancestor of current route is active", () => {
    const state = router.getState()!;

    expect(state.name).toBe("users.view");
    expect(router.isActiveRoute("users")).toBe(true);
  });

  it("strictEquality blocks ancestor match", () => {
    expect(router.isActiveRoute("users", {}, true)).toBe(false);
  });

  test.prop([arbFixtureRoute, fc.boolean()], { numRuns: NUM_RUNS.fast })(
    "monotonicity of strict: strict=true → strict=false",
    (name, ignoreQP) => {
      const params = router.getState()!.params;
      const strictResult = router.isActiveRoute(name, params, true, ignoreQP);
      const looseResult = router.isActiveRoute(name, params, false, ignoreQP);

      if (strictResult) {
        expect(looseResult).toBe(true);
      }
    },
  );

  test.prop([arbFixtureRoute, fc.boolean()], { numRuns: NUM_RUNS.fast })(
    "monotonicity of ignoreQueryParams: ignoreQP=false → ignoreQP=true",
    (name, strict) => {
      const params = router.getState()!.params;
      const withQP = router.isActiveRoute(name, params, strict, false);
      const withoutQP = router.isActiveRoute(name, params, strict, true);

      if (withQP) {
        expect(withoutQP).toBe(true);
      }
    },
  );

  it("empty string always returns false", () => {
    expect(router.isActiveRoute("")).toBe(false);
  });
});
