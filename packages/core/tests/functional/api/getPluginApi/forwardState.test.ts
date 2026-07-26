import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("forwardState", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns same state if no forward defined", () => {
    const state = getPluginApi(router).forwardState("home", { id: 1 });

    expect(state.name).toBe("home");
    expect(state.params.id).toBe(1);
  });

  it("forwards to another route, layering source defaults (target defaults are terminal)", async () => {
    // Add routes with defaultParams
    routesApi.add([
      { name: "srcRoute", path: "/src", defaultParams: { a: 1 } },
      { name: "dstRoute", path: "/dst", defaultParams: { b: 2 } },
    ]);
    routesApi.update("srcRoute", { forwardTo: "dstRoute" });

    // forwardState resolves the forward and layers the SOURCE route's defaults
    // (a:1) — a forwardTo-specific merge the terminal builders cannot reconstruct
    // (they see only the resolved target). The TARGET's defaults (b:2) are NOT
    // merged here; they are applied downstream by makeState (#1549).
    const forwarded = getPluginApi(router).forwardState("srcRoute", { c: 3 });

    expect(forwarded.name).toBe("dstRoute");
    expect(forwarded.params).toStrictEqual({ a: 1, c: 3 });

    // The committed state (navigate → makeState) carries the target default too.
    const state = await router.navigate("srcRoute", { c: 3 });

    expect(state.name).toBe("dstRoute");
    expect(state.params).toStrictEqual({ a: 1, b: 2, c: 3 });
  });

  it("forwards with only source route defaults (line 595)", () => {
    // Add routes: source has defaults, target doesn't
    routesApi.add([
      {
        name: "srcWithDefaults",
        path: "/src-with-defaults",
        defaultParams: { a: 1 },
      },
      { name: "dstNoDefaults", path: "/dst-no-defaults" },
    ]);
    routesApi.update("srcWithDefaults", {
      forwardTo: "dstNoDefaults",
    });

    const state = getPluginApi(router).forwardState("srcWithDefaults", {
      c: 3,
    });

    expect(state.name).toBe("dstNoDefaults");
    expect(state.params).toStrictEqual({ a: 1, c: 3 });
  });

  it("forwards with only target route defaults — applied by the state builder, not forwardState (line 598)", async () => {
    // Add routes: source has no defaults, target has defaults
    routesApi.add([
      { name: "srcNoDefaults", path: "/src-no-defaults" },
      {
        name: "dstWithDefaults",
        path: "/dst-with-defaults",
        defaultParams: { b: 2 },
      },
    ]);
    routesApi.update("srcNoDefaults", {
      forwardTo: "dstWithDefaults",
    });

    // Source has no defaults; forwardState returns the user params only — the
    // TARGET's b:2 is NOT merged here (terminal now, #1549).
    const forwarded = getPluginApi(router).forwardState("srcNoDefaults", {
      c: 3,
    });

    expect(forwarded.name).toBe("dstWithDefaults");
    expect(forwarded.params).toStrictEqual({ c: 3 });

    // The committed state (navigate → makeState) applies the target default.
    const state = await router.navigate("srcNoDefaults", { c: 3 });

    expect(state.name).toBe("dstWithDefaults");
    expect(state.params).toStrictEqual({ b: 2, c: 3 });
  });
});
