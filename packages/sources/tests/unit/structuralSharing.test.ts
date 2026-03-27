import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteSource, createTransitionSource } from "../../src";
import { computeSnapshot } from "../../src/computeSnapshot.js";

import type { Router } from "@real-router/core";

describe("structural sharing", () => {
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

  describe("computeSnapshot", () => {
    it("inactive node: navigation between unrelated routes → snapshot === prevSnapshot", async () => {
      const initialSnapshot = computeSnapshot(
        { route: undefined, previousRoute: undefined },
        router,
        "admin.settings",
      );

      await router.navigate("users.view", { id: "1" });

      const afterNav = computeSnapshot(
        initialSnapshot,
        router,
        "admin.settings",
      );

      expect(afterNav).toBe(initialSnapshot);
    });

    it("same path, different meta.id → snapshot === prevSnapshot", () => {
      const api = getPluginApi(router);
      const state1 = api.makeState("home", {}, "/");
      const state2 = api.makeState("home", {}, "/");

      const prevSnapshot = { route: state1, previousRoute: undefined };

      const nextSnapshot = computeSnapshot(prevSnapshot, router, "", {
        route: state2,
        previousRoute: undefined,
      });

      expect(nextSnapshot).toBe(prevSnapshot);
    });

    it("active node, path changed → snapshot !== prevSnapshot", async () => {
      const prevSnapshot = computeSnapshot(
        { route: undefined, previousRoute: undefined },
        router,
        "",
      );

      await router.navigate("users.view", { id: "1" });

      const afterNav = computeSnapshot(prevSnapshot, router, "");

      expect(afterNav).not.toBe(prevSnapshot);
      expect(afterNav.route?.name).toBe("users.view");
    });
  });

  // ===

  describe("createRouteSource", () => {
    it("listener called on navigation (path changes)", async () => {
      const source = createRouteSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      await router.navigate("users.view", { id: "1" });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(source.getSnapshot().route?.name).toBe("users.view");
    });

    it("snapshot updates correctly across multiple navigations", async () => {
      const source = createRouteSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      await router.navigate("users.view", { id: "1" });
      await router.navigate("admin.settings");

      expect(listener).toHaveBeenCalledTimes(2);
      expect(source.getSnapshot().route?.name).toBe("admin.settings");
      expect(source.getSnapshot().previousRoute?.name).toBe("users.view");
    });
  });

  // ===

  describe("createTransitionSource", () => {
    it("TRANSITION_START listener fires on first transition, snapshot updates", async () => {
      const source = createTransitionSource(router);
      const listener = vi.fn();

      source.subscribe(listener);

      await router.navigate("admin.settings");

      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(source.getSnapshot().isTransitioning).toBe(false);
    });
  });
});
