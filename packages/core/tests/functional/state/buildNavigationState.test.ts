import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi, RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let api: PluginApi;

describe("getPluginApi().buildNavigationState()", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    api = getPluginApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("happy path", () => {
    it("should return State for existing route with no params", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
      expect(state?.params).toStrictEqual({});
    });

    it("should return State for existing route with params", () => {
      const state = api.buildNavigationState("items", { id: "123" });

      expect(state).toBeDefined();
      expect(state?.name).toBe("items");
      expect(state?.params).toStrictEqual({ id: "123" });
    });

    it("should return State with correct path", () => {
      const state = api.buildNavigationState("items", { id: "456" });

      expect(state).toBeDefined();
      expect(state?.path).toBe("/items/456");
    });

    it("should return frozen State (immutable)", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state?.params)).toBe(true);
    });
  });

  describe("route not found", () => {
    it("should return undefined for non-existent route", () => {
      const state = api.buildNavigationState("nonexistent");

      expect(state).toBeUndefined();
    });

    it("should return undefined (not null) for non-existent route", () => {
      const state = api.buildNavigationState("nonexistent.route");

      expect(state).toBeUndefined();
      expect(state).not.toBeNull();
    });
  });

  describe("route forwarding (plugin interception)", () => {
    it("should resolve forwarded routes (forwardTo)", () => {
      routesApi.add({
        name: "old-route",
        path: "/old",
        forwardTo: "home",
      });

      const state = api.buildNavigationState("old-route");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
      expect(state?.path).toBe("/home");
    });

    it("should apply default params from route definition", () => {
      routesApi.add({
        name: "with-defaults",
        path: "/defaults/:id",
        defaultParams: { id: "default-id" },
      });

      const state = api.buildNavigationState("with-defaults");

      expect(state).toBeDefined();
      expect(state?.params).toStrictEqual({ id: "default-id" });
    });
  });

  describe("params defaulting", () => {
    it("should use empty object when params not provided", () => {
      const state = api.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.params).toStrictEqual({});
    });
  });

  describe("argument validation", () => {
    it("should return undefined for empty string routeName", () => {
      const state = api.buildNavigationState("");

      expect(state).toBeUndefined();
    });
  });

  describe("no side effects (pure function)", () => {
    it("should not change router state", async () => {
      await router.navigate("users", {});

      const stateBefore = router.getState();

      api.buildNavigationState("orders");

      const stateAfter = router.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("should not emit any transition events", () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const unsub1 = api.addEventListener(events.TRANSITION_START, onStart);
      const unsub2 = api.addEventListener(events.TRANSITION_SUCCESS, onSuccess);
      const unsub3 = api.addEventListener(events.TRANSITION_ERROR, onError);

      api.buildNavigationState("home");
      api.buildNavigationState("nonexistent");

      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsub1();
      unsub2();
      unsub3();
    });
  });

  describe("stopped router", () => {
    it("should work when router is not started", () => {
      const stoppedRouter = createTestRouter();
      const stoppedApi = getPluginApi(stoppedRouter);

      const state = stoppedApi.buildNavigationState("home");

      expect(state).toBeDefined();
      expect(state?.name).toBe("home");
    });
  });

  describe("noValidate mode", () => {
    it("should skip validation and return undefined for invalid input", async () => {
      const noValidateRouter = createTestRouter();

      await noValidateRouter.start("/home");

      const noValidateApi = getPluginApi(noValidateRouter);
      const result = noValidateApi.buildNavigationState(
        123 as unknown as string,
      );

      expect(result).toBeUndefined();

      noValidateRouter.stop();
    });
  });

  describe("query channel (#1571)", () => {
    /**
     * `buildNavigationState` was the ONE pipeline entry point without a query
     * slot — `navigate` / `buildPath` / `canNavigateTo` / `isActiveRoute` /
     * `makeState` all take one. A caller could only reach the query channel by
     * riding declared keys in the `params` bag, which is exactly what the
     * always-on channel guard is meant to reject.
     */
    beforeEach(() => {
      routesApi.add([{ name: "q", path: "/q?lang&page" }]);
    });

    it("threads an explicit search argument into state.search and state.path", () => {
      const state = api.buildNavigationState("q", {}, { lang: "fr" });

      expect(state?.search).toStrictEqual({ lang: "fr" });
      expect(state?.path).toBe("/q?lang=fr");
    });

    it("lets an explicit search value beat a params-bag twin", () => {
      // Precedence parity with the other five entry points: the explicit
      // channel wins over a declared key that rode in `params`.
      const state = api.buildNavigationState(
        "q",
        { lang: "PARAM" },
        { lang: "SEARCH" },
      );

      expect(state?.search).toStrictEqual({ lang: "SEARCH" });
      expect(state?.params).toStrictEqual({});
      expect(state?.path).toBe("/q?lang=SEARCH");
    });

    it("keeps the two-argument form working — the slot is additive", () => {
      // The single-bag shape its only consumer relies on today must not move.
      const state = api.buildNavigationState("q", { lang: "fr" });

      expect(state?.search).toStrictEqual({ lang: "fr" });
      expect(state?.path).toBe("/q?lang=fr");
    });

    it("treats an omitted and an explicitly undefined search alike", () => {
      const omitted = api.buildNavigationState("q", { page: "2" });
      const explicit = api.buildNavigationState("q", { page: "2" }, undefined);

      expect(explicit?.search).toStrictEqual(omitted?.search);
      expect(explicit?.path).toBe(omitted?.path);
    });

    it("carries the query channel through a forwardTo resolution", () => {
      routesApi.add([
        { name: "q-dst", path: "/q-dst?lang" },
        { name: "q-src", path: "/q-src", forwardTo: "q-dst" },
      ]);

      const state = api.buildNavigationState("q-src", {}, { lang: "it" });

      expect(state?.name).toBe("q-dst");
      expect(state?.search).toStrictEqual({ lang: "it" });
      expect(state?.path).toBe("/q-dst?lang=it");
    });
  });
});
