import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { errorCodes, events, getPluginApi } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router, PluginApi } from "@real-router/core";

let router: Router;
let api: PluginApi;

describe("getPluginApi()", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("should return an object with all expected methods", () => {
    expect(typeof api.makeState).toBe("function");
    expect(typeof api.buildState).toBe("function");
    expect(typeof api.forwardState).toBe("function");
    expect(typeof api.matchPath).toBe("function");
    expect(typeof api.setRootPath).toBe("function");
    expect(typeof api.getRootPath).toBe("function");
    expect(typeof api.navigateToState).toBe("function");
    expect(typeof api.addEventListener).toBe("function");
    expect(typeof api.getOptions).toBe("function");
    expect(typeof api.getTree).toBe("function");
  });

  it("should return a new object on each call", () => {
    const api2 = getPluginApi(router);

    expect(api).not.toBe(api2);
  });

  it("makeState should delegate to router.makeState", () => {
    const state = api.makeState("home", {}, "/home");

    expect(state.name).toBe("home");
    expect(state.path).toBe("/home");
  });

  it("buildState should delegate to router.buildState", () => {
    const result = api.buildState("home", {});

    expect(result).toBeDefined();
    expect(result!.name).toBe("home");
  });

  it("forwardState should delegate to router.forwardState", () => {
    const result = api.forwardState("home", {});

    expect(result.name).toBe("home");
  });

  it("matchPath should delegate to router.matchPath", () => {
    const state = api.matchPath("/home");

    expect(state).toBeDefined();
    expect(state!.name).toBe("home");
  });

  it("setRootPath/getRootPath should delegate to router", () => {
    api.setRootPath("/app");

    expect(api.getRootPath()).toBe("/app");

    api.setRootPath("");
  });

  it("navigateToState should delegate to router.navigateToState", async () => {
    await router.start("/home");
    const toState = api.makeState("users", {}, "/users");
    const fromState = router.getState();
    const result = await api.navigateToState(toState, fromState, {});

    expect(result.name).toBe("users");
  });

  it("addEventListener should delegate to router.addEventListener", async () => {
    await router.start("/home");
    let called = false;
    const unsub = api.addEventListener(events.TRANSITION_SUCCESS, () => {
      called = true;
    });

    await router.navigate("users");

    expect(called).toBe(true);

    unsub();
  });

  it("getOptions should delegate to router.getOptions", () => {
    const opts = api.getOptions();

    expect(opts).toBeDefined();
    expect(opts.defaultRoute).toBe("home");
  });

  it("getTree should delegate to router.getTree", () => {
    const tree = api.getTree();

    expect(tree).toBeDefined();
    expect(tree.children.size).toBeGreaterThan(0);
  });

  it("should throw ROUTER_DISPOSED for mutating methods after dispose", () => {
    router.dispose();

    const disposedApi = getPluginApi(router);

    try {
      disposedApi.addEventListener(events.TRANSITION_SUCCESS, () => {});

      expect.fail("Should have thrown");
    } catch (error: any) {
      expect(error.code).toBe(errorCodes.ROUTER_DISPOSED);
    }
  });
});
