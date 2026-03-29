import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPluginApi, getRoutesApi } from "../../../../src/api";
import { createTestRouter } from "../../../helpers";

import type { RoutesApi } from "../../../../src/api";
import type { Router } from "@real-router/types";

let router: Router;
let routesApi: RoutesApi;

describe("makeState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns valid state object", () => {
    const state = getPluginApi(router).makeState(
      "home",
      { foo: "bar" },
      "/home",
    );

    expect(state).toMatchObject({
      name: "home",
      path: "/home",
      params: { foo: "bar" },
    });
  });

  it("merges with defaultParams", () => {
    // Add a route with defaultParams
    routesApi.add({
      name: "withDefaults",
      path: "/with-defaults",
      defaultParams: { lang: "en" },
    });
    const state = getPluginApi(router).makeState(
      "withDefaults",
      { id: 123 },
      "/with-defaults",
    );

    expect(state.params).toStrictEqual({ lang: "en", id: 123 });
  });

  it("uses empty params when no params and no defaultParams (line 328)", () => {
    // home route has no defaultParams defined
    // Call makeState with undefined params (no params, no defaults)
    const state = getPluginApi(router).makeState(
      "home",
      undefined as never,
      "/home",
    );

    expect(state.params).toStrictEqual({});
  });
});
