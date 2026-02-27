import { logger } from "@real-router/logger";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  cloneRouter,
  createRouter,
  getLifecycleApi,
  getRoutesApi,
} from "@real-router/core";

import type { LifecycleApi, Route, Router } from "@real-router/core";
import type { LogCallback } from "@real-router/logger";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "products", path: "/products/:id" },
  { name: "users", path: "/users/:id" },
  { name: "about", path: "/about", defaultParams: { tab: "info" } },
  { name: "admin", path: "/admin" },
  { name: "public", path: "/public" },
];

const defaultOptions = { defaultRoute: "home" };

describe("SSR race conditions", () => {
  describe("cloned router instance - solution", () => {
    it("should isolate state between cloned instances", async () => {
      const baseRouter = createRouter(routes, defaultOptions);

      // Two isolated clones (simulating two SSR requests)
      const routerA = cloneRouter(baseRouter);
      const routerB = cloneRouter(baseRouter);

      await routerA.start("/home");
      await routerB.start("/home");

      // Navigate on separate instances (synchronous navigation)
      await routerA.navigate("products", { id: "123" });
      await routerB.navigate("users", { id: "456" });

      // States are isolated - each router has its own state
      expect(routerA.getState()?.name).toBe("products");
      expect(routerA.getState()?.params.id).toBe("123");

      expect(routerB.getState()?.name).toBe("users");
      expect(routerB.getState()?.params.id).toBe("456");

      routerA.stop();
      routerB.stop();
    });

    it("should return correct route from cloned instance", async () => {
      const baseRouter = createRouter(routes, defaultOptions);

      const clone1 = cloneRouter(baseRouter);
      const clone2 = cloneRouter(baseRouter);

      // getRoute on clones returns correct data
      expect(getRoutesApi(clone1).get("about")?.defaultParams).toStrictEqual({
        tab: "info",
      });
      expect(getRoutesApi(clone2).get("about")?.defaultParams).toStrictEqual({
        tab: "info",
      });
    });

    it("should isolate route configuration updates between clones", async () => {
      const baseRouter = createRouter(routes, defaultOptions);

      const clone1 = cloneRouter(baseRouter);
      const clone2 = cloneRouter(baseRouter);

      // Modify one clone's route configuration
      getRoutesApi(clone1).update("about", {
        defaultParams: { tab: "changed" },
      });

      // Clone 1 sees the change
      expect(getRoutesApi(clone1).get("about")?.defaultParams).toStrictEqual({
        tab: "changed",
      });

      // Clone 2 still has original value - isolated!
      expect(getRoutesApi(clone2).get("about")?.defaultParams).toStrictEqual({
        tab: "info",
      });
    });

    it("should isolate lifecycle handlers between clones", async () => {
      const baseRouter = createRouter(routes, defaultOptions);
      const guardCallsClone1: string[] = [];
      const guardCallsClone2: string[] = [];

      const clone1 = cloneRouter(baseRouter);
      const clone2 = cloneRouter(baseRouter);

      // Add different guards to each clone
      getLifecycleApi(clone1).addActivateGuard("admin", () => () => {
        guardCallsClone1.push("clone1-admin");

        return true;
      });

      getLifecycleApi(clone2).addActivateGuard("admin", () => () => {
        guardCallsClone2.push("clone2-admin");

        return true;
      });

      await clone1.start("/home");
      await clone2.start("/home");

      // Navigate both (synchronous)
      await clone1.navigate("admin");
      await clone2.navigate("admin");

      // Each clone called its own guard
      expect(guardCallsClone1).toStrictEqual(["clone1-admin"]);
      expect(guardCallsClone2).toStrictEqual(["clone2-admin"]);

      clone1.stop();
      clone2.stop();
    });
  });

  describe("runtime protection - concurrent navigation warning", () => {
    let logCallback: ReturnType<typeof vi.fn>;
    let originalConfig: ReturnType<typeof logger.getConfig>;
    let router: Router;
    let lifecycle: LifecycleApi;

    beforeEach(async () => {
      // Save original config
      originalConfig = logger.getConfig();

      // Configure logger with callback to capture warnings
      logCallback = vi.fn();
      logger.configure({
        level: "all",
        callback: logCallback as LogCallback,
      });

      router = createRouter(routes, defaultOptions);
      await router.start("/home");
      lifecycle = getLifecycleApi(router);
    });

    afterEach(() => {
      router.stop();
      // Restore original config
      logger.configure(originalConfig);
    });

    it("should warn when navigate called during active async navigation", async () => {
      // Add async guard to make navigation async
      lifecycle.addActivateGuard("admin", () => async () => {
        // Start another navigation while this one is in progress
        await router.navigate("public");
        // Allow time for warning to be logged
        await new Promise((resolve) => setTimeout(resolve, 10));

        return true;
      });

      // Start navigation (will be async due to guard)
      await new Promise<void>((resolve) => {
        router
          .navigate("admin", {})
          .then(() => {
            // This callback is called when admin navigation is cancelled
            // or when it completes
            resolve();

            return;
          })
          .catch(() => {
            // Ignore errors
            resolve();
          });
      });

      // Check that concurrent navigation warning was logged
      const calls = logCallback.mock.calls as Parameters<LogCallback>[];
      const concurrentWarning = calls.find(
        (call) =>
          call[0] === "warn" &&
          call[1] === "router.navigate" &&
          call[2].includes("Concurrent navigation"),
      );

      expect(concurrentWarning).toBeDefined();
    });

    it("should not warn for sequential navigations", async () => {
      // First navigation (sync)
      await router.navigate("admin");
      logCallback.mockClear();

      // Second navigation (sync, after first completed)
      await router.navigate("public");

      // No concurrent navigation warning
      const allCalls = logCallback.mock.calls as Parameters<LogCallback>[];
      const concurrentWarnings = allCalls.filter(
        (call) =>
          call[0] === "warn" &&
          call[1] === "router.navigate" &&
          call[2].includes("Concurrent navigation"),
      );

      expect(concurrentWarnings).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle navigation cancellation correctly", async () => {
      const router = createRouter(routes, defaultOptions);

      await router.start("/home");

      let secondNavCompleted = false;

      // Add async guard to first route
      getLifecycleApi(router).addActivateGuard("admin", () => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));

        return true;
      });

      // Start async navigation (first navigation will be cancelled)
      await router.navigate("admin");

      // Immediately start second navigation (will cancel first)
      await router.navigate("public", {}).then(() => {
        secondNavCompleted = true;

        return;
      });

      // Wait for everything to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second navigation completed
      expect(secondNavCompleted).toBe(true);
      expect(router.getState()?.name).toBe("public");

      router.stop();
    });

    it("should not leak state from clone to base router", async () => {
      const baseRouter = createRouter(routes, defaultOptions);
      const clone = cloneRouter(baseRouter);

      await clone.start("/home");
      await clone.navigate("admin");

      expect(clone.getState()?.name).toBe("admin");

      clone.stop();

      // Base router is unaffected (was never started)
      expect(baseRouter.getState()).toBeUndefined();
    });

    it("should maintain route tree independence between clones", async () => {
      const baseRouter = createRouter(routes, defaultOptions);

      const clone1 = cloneRouter(baseRouter);
      const clone2 = cloneRouter(baseRouter);

      // Add route to clone1 only
      getRoutesApi(clone1).add({ name: "clone1only", path: "/clone1only" });

      // Clone1 has the route
      expect(getRoutesApi(clone1).has("clone1only")).toBe(true);

      // Clone2 doesn't have it
      expect(getRoutesApi(clone2).has("clone1only")).toBe(false);

      // Base router doesn't have it
      expect(getRoutesApi(baseRouter).has("clone1only")).toBe(false);
    });
  });
});
