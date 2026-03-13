import { describe, expect, it } from "vitest";

import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createFixtureRouter, createStartedRouter } from "./helpers";

describe("forwardState + Navigate Forwarding Properties", () => {
  it("terminality: forwardState result has no further forwardTo", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);
    const routesApi = getRoutesApi(router);

    const result = pluginApi.forwardState("oldUsers", {});
    const targetRoute = routesApi.get(result.name);

    expect(targetRoute).toBeDefined();
    expect(targetRoute!.forwardTo).toBeUndefined();
  });

  it("idempotency: forwardState(forwardState(name).name) === forwardState(name)", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const first = pluginApi.forwardState("oldUsers", {});
    const second = pluginApi.forwardState(first.name, first.params);

    expect(second.name).toBe(first.name);
  });

  it("navigate follows forward: navigate('oldUsers') resolves to 'users'", async () => {
    const router = await createStartedRouter();

    const state = await router.navigate("oldUsers");

    expect(state.name).not.toBe("oldUsers");
    expect(state.name).toBe("users");

    router.stop();
  });

  it("params preserved through forwarding", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const result = pluginApi.forwardState("oldUsers", { extra: "value" });

    expect(result.params.extra).toBe("value");
  });
});
