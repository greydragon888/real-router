import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createLifecycleTestRouter, type Router } from "./setup";

import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/removeGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove activate guard and allow navigation", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);

    lifecycle.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove deactivate guard and allow navigation", async () => {
    lifecycle.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);

    lifecycle.removeDeactivateGuard("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should allow navigation after removing activate guard", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    lifecycle.removeActivateGuard("admin");

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });

  it("should allow navigation after removing deactivate guard", async () => {
    lifecycle.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    lifecycle.removeDeactivateGuard("users");

    const state = await router.navigate("home");

    expect(state.name).toBe("home");
  });

  it("should not throw when removing non-existent activate guard", () => {
    expect(() => {
      lifecycle.removeActivateGuard("nonexistent");
    }).not.toThrow();
  });

  it("should not throw when removing non-existent deactivate guard", () => {
    expect(() => {
      lifecycle.removeDeactivateGuard("nonexistent");
    }).not.toThrow();
  });

  it("should handle re-adding guard after removal", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.removeActivateGuard("admin");
    lifecycle.addActivateGuard("admin", () => () => true);

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should handle removing then re-adding same guard", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.removeActivateGuard("admin");

    lifecycle.addActivateGuard("admin", () => () => true);

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });

  it("should remove all guards for a route", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("admin", () => () => false);

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);

    lifecycle.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove only specified route guards", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("users", () => () => false);

    lifecycle.removeActivateGuard("admin");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should handle removing nested route guards independently", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });

    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("admin.settings", () => () => false);

    lifecycle.removeActivateGuard("admin.settings");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle removing parent guard but keeping child guard", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });

    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addActivateGuard("admin.settings", () => () => false);

    lifecycle.removeActivateGuard("admin");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle mixed guard types removal", async () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    lifecycle.addDeactivateGuard("users", () => () => false);

    lifecycle.removeActivateGuard("admin");
    lifecycle.removeDeactivateGuard("users");

    await router.navigate("users");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should handle removing guards before navigation", async () => {
    lifecycle.addActivateGuard("users", () => () => false);
    lifecycle.removeActivateGuard("users");

    const state = await router.navigate("users");

    expect(state.name).toBe("users");
  });

  it("should handle removing guards after router stops", () => {
    lifecycle.addActivateGuard("admin", () => () => false);
    router.stop();

    expect(() => {
      lifecycle.removeActivateGuard("admin");
    }).not.toThrow();
  });

  /**
   * `removeActivateGuard` / `removeDeactivateGuard` are the inverse of
   * `addActivateGuard` / `addDeactivateGuard`, which register EXTERNAL
   * (component-managed) guards. They must clear only the external slot: a
   * DEFINITION guard from route config survives, exactly as it does through
   * auto-cleanup (#1171). Removing a route-config guard is the job of
   * `getRoutesApi().update(name, { canX: null })`, not the external-guard API.
   */
  describe("route-config (definition) guard survives removeXGuard (external-only)", () => {
    it("removeDeactivateGuard leaves a route-config canDeactivate intact", async () => {
      const guard = () => () => false;

      routesApi.add({ name: "cfg-d", path: "/cfg-d", canDeactivate: guard });
      await router.navigate("cfg-d");

      // The config guard blocks leaving cfg-d.
      expect(router.canNavigateTo("home")).toBe(false);

      lifecycle.removeDeactivateGuard("cfg-d"); // external-guard API — no external here

      // The config guard was never external — it must still block, and remain readable.
      expect(router.canNavigateTo("home")).toBe(false);
      expect(routesApi.get("cfg-d")?.canDeactivate).toBe(guard);
    });

    it("removeActivateGuard leaves a route-config canActivate intact", () => {
      const guard = () => () => false;

      routesApi.add({ name: "cfg-a", path: "/cfg-a", canActivate: guard });

      // The config guard blocks activating cfg-a.
      expect(router.canNavigateTo("cfg-a")).toBe(false);

      lifecycle.removeActivateGuard("cfg-a"); // external-guard API — no external here

      expect(router.canNavigateTo("cfg-a")).toBe(false);
      expect(routesApi.get("cfg-a")?.canActivate).toBe(guard);
    });
  });
});
