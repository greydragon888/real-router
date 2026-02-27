import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi } from "../../../../src";
import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/types";

let router: Router;

describe("buildState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns state if route exists", () => {
    const state = getPluginApi(router).buildState("home", {});

    expect(state?.name).toBe("home");
    expect(state?.params).toStrictEqual({});
  });

  it("returns undefined if route is unknown", () => {
    const state = getPluginApi(router).buildState("unknown.route", {});

    expect(state).toBe(undefined);
  });

  describe("argument validation", () => {
    it("throws TypeError for non-string routeName", () => {
      expect(() =>
        getPluginApi(router).buildState(123 as unknown as string, {}),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).buildState(null as unknown as string, {}),
      ).toThrowError(/Invalid routeName/);
    });

    it("throws TypeError for invalid routeParams", () => {
      expect(() =>
        getPluginApi(router).buildState("home", "invalid" as never),
      ).toThrowError(TypeError);
      expect(() =>
        getPluginApi(router).buildState("home", (() => {}) as never),
      ).toThrowError(/Invalid routeParams/);
    });
  });
});
