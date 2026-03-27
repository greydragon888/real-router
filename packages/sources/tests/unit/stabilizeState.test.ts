import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { computeSnapshot } from "../../src/computeSnapshot.js";
import { stabilizeState } from "../../src/stabilizeState.js";

import type { Router, State } from "@real-router/core";

describe("stabilizeState", () => {
  const routes = [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/" },
        { name: "view", path: "/:id" },
        { name: "edit", path: "/:id/edit" },
      ],
    },
    {
      name: "admin",
      path: "/admin",
      children: [
        { name: "dashboard", path: "/" },
        { name: "settings", path: "/settings" },
      ],
    },
  ];

  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  // ===
  // Basic scenarios
  // ===

  describe("basic scenarios", () => {
    it("same reference (prev === next) → returns prev", () => {
      const api = getPluginApi(router);
      const state = api.makeState("home", {}, "/");

      expect(stabilizeState(state, state)).toBe(state);
    });

    it("both undefined → returns prev", () => {
      const result = stabilizeState<State | undefined>(undefined, undefined);

      expect(result).toBeUndefined();
    });

    it("prev = undefined, next = State → returns next", () => {
      const api = getPluginApi(router);
      const next = api.makeState("home", {}, "/");

      const result = stabilizeState(undefined, next);

      expect(result).toBe(next);
    });

    it("prev = State, next = undefined → returns next (undefined)", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, "/");

      const result = stabilizeState(prev, undefined);

      expect(result).toBeUndefined();
    });
  });

  // ===
  // Path-based stabilization
  // ===

  describe("path-based stabilization", () => {
    it("same path, different meta.id → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {});
      const next = api.makeState("home", {});

      expect(prev).not.toBe(next);
      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, different transition → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, "/");
      const next = api.makeState("home", {}, "/");

      expect(prev).not.toBe(next);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, different meta + transition → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("users.view", { id: "1" }, "/users/1");
      const next = api.makeState("users.view", { id: "1" }, "/users/1");

      expect(prev).not.toBe(next);
      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, without meta vs with meta → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, "/");
      const next = api.makeState("home", {});

      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("different paths → result === next", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, "/");
      const next = api.makeState("users.view", { id: "1" }, "/users/1");

      expect(stabilizeState(prev, next)).toBe(next);
    });

    it("different paths, same name → result === next", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("users.view", { id: "1" }, "/users/1");
      const next = api.makeState("users.view", { id: "2" }, "/users/2");

      expect(stabilizeState(prev, next)).toBe(next);
    });
  });

  // ===
  // Integration with real router
  // ===

  describe("integration with real router", () => {
    it("inactive node: snapshot ref stable when route = undefined for both", async () => {
      const initialSnapshot = computeSnapshot(
        { route: undefined, previousRoute: undefined },
        router,
        "admin.settings",
      );

      expect(initialSnapshot.route).toBeUndefined();

      await router.navigate("users.view", { id: "1" });

      const afterNav = computeSnapshot(
        initialSnapshot,
        router,
        "admin.settings",
      );

      expect(afterNav).toBe(initialSnapshot);
    });

    it("reload to same route: stabilizeState preserves prev (same path)", async () => {
      await router.navigate("users.view", { id: "42" });

      const prevRoute = router.getState()!;

      await router.navigate("users.view", { id: "42" }, { reload: true });

      const nextRoute = router.getState()!;

      expect(prevRoute.path).toBe(nextRoute.path);
      expect(prevRoute).not.toBe(nextRoute);
      expect(stabilizeState(prevRoute, nextRoute)).toBe(prevRoute);
    });

    it("navigate to different route: path changed → returns next", async () => {
      const prevRoute = router.getState()!;

      await router.navigate("users.view", { id: "1" });

      const nextRoute = router.getState()!;

      expect(prevRoute.path).not.toBe(nextRoute.path);
      expect(stabilizeState(prevRoute, nextRoute)).toBe(nextRoute);
    });
  });
});
