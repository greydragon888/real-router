import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getRoutesApi } from "@real-router/core";

import { createLifecycleTestRouter, type Router } from "./setup";

import type { RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;

describe("core/route-lifecycle/canNavigateTo", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    routesApi = getRoutesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return true for route with no guards", () => {
    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for route with blocking activation guard", async () => {
    router.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true for route with passing activation guard", async () => {
    router.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for current route with blocking deactivation guard", async () => {
    router.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return true for current route with passing deactivation guard", async () => {
    router.addDeactivateGuard("users", () => () => true);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should check nested route guards in correct order", async () => {
    routesApi.add({ name: "users", path: "/users" }, { parent: "admin" });

    const adminGuard = vi.fn(() => true);
    const usersGuard = vi.fn(() => true);

    router.addActivateGuard("admin", () => adminGuard);
    router.addActivateGuard("admin.users", () => usersGuard);

    await router.navigate("index");

    const result = router.canNavigateTo("admin.users");

    expect(result).toBe(true);
    expect(adminGuard).toHaveBeenCalled();
    expect(usersGuard).toHaveBeenCalled();
  });

  it("should return false if any nested parent guard blocks", async () => {
    routesApi.add({ name: "users", path: "/users" }, { parent: "admin" });

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.users", () => () => true);

    await router.navigate("index");

    expect(router.canNavigateTo("admin.users")).toBe(false);
  });

  it("should return false for non-existent route", () => {
    expect(router.canNavigateTo("nonexistent")).toBe(false);
  });

  it("should return true when route has no guards (started with no default route)", () => {
    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should resolve forwarded route and check guards on target", async () => {
    routesApi.add({
      name: "old-admin",
      path: "/old-admin",
      forwardTo: "admin",
    });
    router.addActivateGuard("admin", () => () => false);

    await router.navigate("index");

    expect(router.canNavigateTo("old-admin")).toBe(false);
  });

  it("should return false if target route has async guard (sync check cannot validate)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.addActivateGuard("admin", () => async () => true);
    await router.navigate("index");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sync check cannot resolve async guards"),
    );

    warnSpy.mockRestore();
  });

  it("should return true for navigating to the same route (no transition needed)", async () => {
    await router.navigate("users");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false when overwritten deactivate guard blocks", async () => {
    router.addDeactivateGuard("users", () => () => true);
    router.addDeactivateGuard("users", () => () => false); // overwrites previous

    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return false when overwritten activate guard blocks", async () => {
    router.addActivateGuard("admin", () => () => true);
    router.addActivateGuard("admin", () => () => false); // overwrites previous

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should handle complex nested transitions with mixed guards", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });

    router.addDeactivateGuard("users.list", () => () => true);
    router.addActivateGuard("admin", () => () => true);
    router.addActivateGuard("admin.settings", () => () => true);

    await router.navigate("users.list");

    expect(router.canNavigateTo("admin.settings")).toBe(true);
  });

  it("should check guards with params", async () => {
    router.addActivateGuard("users.view", () => (toState) => {
      const id = toState.params.id as string;

      return Number.parseInt(id, 10) > 0;
    });

    await router.navigate("index");

    expect(router.canNavigateTo("users.view", { id: "123" })).toBe(true);
    expect(router.canNavigateTo("users.view", { id: "0" })).toBe(false);
  });

  it("should return false if guard throws", async () => {
    router.addActivateGuard("admin", () => () => {
      throw new Error("Guard error");
    });
    await router.navigate("index");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
  });

  it("should handle transition from deeply nested route", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });
    routesApi.add(
      { name: "profile", path: "/profile" },
      { parent: "admin.settings" },
    );

    router.addDeactivateGuard("admin.settings.profile", () => () => true);
    router.addDeactivateGuard("admin.settings", () => () => true);
    router.addDeactivateGuard("admin", () => () => true);
    router.addActivateGuard("users", () => () => true);

    await router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false if any guard in deeply nested path blocks", async () => {
    routesApi.add({ name: "settings", path: "/settings" }, { parent: "admin" });
    routesApi.add(
      { name: "profile", path: "/profile" },
      { parent: "admin.settings" },
    );

    router.addDeactivateGuard("admin.settings.profile", () => () => true);
    router.addDeactivateGuard("admin.settings", () => () => false);
    router.addDeactivateGuard("admin", () => () => true);

    await router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should return true when guard returns true", async () => {
    router.addActivateGuard("admin", () => (_toState, _fromState) => {
      return true;
    });
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false when guard returns false", async () => {
    router.addActivateGuard("admin", () => (_toState, _fromState) => {
      return false;
    });
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true when guard returns true (shorthand)", async () => {
    router.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should throw TypeError for non-string route name", () => {
    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(123)).toThrowError(TypeError);
    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(null)).toThrowError(TypeError);
    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(undefined)).toThrowError(TypeError);
  });

  it("should throw TypeError for whitespace-only route name", () => {
    expect(() => router.canNavigateTo("   ")).toThrowError(TypeError);
  });

  it("should handle empty params object", async () => {
    router.addActivateGuard("admin", () => () => true);
    await router.navigate("index");

    expect(router.canNavigateTo("admin", {})).toBe(true);
  });

  it("should check guards when no current state", () => {
    router.addActivateGuard("admin", () => () => false);

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should respect canDeactivate from route config", async () => {
    const guard = vi.fn().mockReturnValue(false);

    routesApi.add({
      name: "editor",
      path: "/editor",
      canDeactivate: () => guard,
    });

    await router.navigate("editor");

    expect(router.canNavigateTo("home")).toBe(false);
    expect(guard).toHaveBeenCalled();
  });
});
