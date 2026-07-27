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

  describe("multi-hop chains layer every forwarding hop's defaults (#1566)", () => {
    it("layers an INTERMEDIATE hop's defaults, not only the entered route's", async () => {
      routesApi.add([
        { name: "m1", path: "/m1", forwardTo: "m2" },
        {
          name: "m2",
          path: "/m2",
          forwardTo: "m3",
          defaultParams: { p: "P2" },
        },
        { name: "m3", path: "/m3/:p" },
      ]);

      expect(getPluginApi(router).forwardState("m1", {}).params).toStrictEqual({
        p: "P2",
      });

      const state = await router.navigate("m1");

      expect(state.path).toBe("/m3/P2");
    });

    it("lets an EARLIER hop win over a later one, and the caller over both", async () => {
      routesApi.add([
        {
          name: "e1",
          path: "/e1",
          forwardTo: "e2",
          defaultParams: { p: "P1" },
        },
        {
          name: "e2",
          path: "/e2",
          forwardTo: "e3",
          defaultParams: { p: "P2" },
        },
        { name: "e3", path: "/e3/:p" },
      ]);

      const earliest = await router.navigate("e1");

      expect(earliest.path).toBe("/e3/P1");

      const explicit = await router.navigate("e1", { p: "CALL" });

      expect(explicit.path).toBe("/e3/CALL");
    });

    it("layers hops of a DYNAMIC chain", async () => {
      routesApi.add([
        { name: "d1", path: "/d1", forwardTo: () => "d2" },
        {
          name: "d2",
          path: "/d2",
          forwardTo: () => "d3",
          defaultParams: { p: "DP2" },
        },
        { name: "d3", path: "/d3/:p" },
      ]);

      const state = await router.navigate("d1");

      expect(state.path).toBe("/d3/DP2");
    });

    it("layers hops of a MIXED static→dynamic chain", async () => {
      routesApi.add([
        { name: "x1", path: "/x1", forwardTo: "x2" },
        {
          name: "x2",
          path: "/x2",
          forwardTo: () => "x3",
          defaultParams: { p: "XP2" },
        },
        { name: "x3", path: "/x3/:p" },
      ]);

      const state = await router.navigate("x1");

      expect(state.path).toBe("/x3/XP2");
    });

    it("still leaves the TARGET's own defaults to the state builder", () => {
      routesApi.add([
        { name: "t1", path: "/t1", forwardTo: "t2" },
        { name: "t2", path: "/t2", forwardTo: "t3" },
        { name: "t3", path: "/t3/:p", defaultParams: { p: "P3" } },
      ]);

      // No forwarding hop declares `p`, so forwardState must not invent it —
      // the terminal default is merged downstream (#1549).
      expect(getPluginApi(router).forwardState("t1", {}).params).toStrictEqual(
        {},
      );
    });
  });
});
