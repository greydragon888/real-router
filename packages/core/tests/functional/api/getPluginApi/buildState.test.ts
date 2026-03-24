import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi } from "../../../../src/api";
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
});
