import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/canNavigateTo", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return true for route with no guards", () => {
    void router.start();

    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for route with blocking activation guard", () => {
    router.addActivateGuard("admin", () => () => false);
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true for route with passing activation guard", () => {
    router.addActivateGuard("admin", () => () => true);
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false for current route with blocking deactivation guard", () => {
    router.addDeactivateGuard("users", () => () => false);
    void router.start();
    void router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return true for current route with passing deactivation guard", () => {
    router.addDeactivateGuard("users", () => () => true);
    void router.start();
    void router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should check nested route guards in correct order", () => {
    router.addRoute({ name: "admin.users", path: "/users" });

    const adminGuard = vi.fn(() => true);
    const usersGuard = vi.fn(() => true);

    router.addActivateGuard("admin", () => adminGuard);
    router.addActivateGuard("admin.users", () => usersGuard);

    void router.start();
    void router.navigate("home");

    const result = router.canNavigateTo("admin.users");

    expect(result).toBe(true);
    expect(adminGuard).toHaveBeenCalled();
    expect(usersGuard).toHaveBeenCalled();
  });

  it("should return false if any nested parent guard blocks", () => {
    router.addRoute({ name: "admin.users", path: "/users" });

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.users", () => () => true);

    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin.users")).toBe(false);
  });

  it("should return false for non-existent route", () => {
    void router.start();

    expect(router.canNavigateTo("nonexistent")).toBe(false);
  });

  it("should return true when route has no guards (started with no default route)", () => {
    expect(router.canNavigateTo("home")).toBe(true);
    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should resolve forwarded route and check guards on target", () => {
    router.addRoute({
      name: "old-admin",
      path: "/old-admin",
      forwardTo: "admin",
    });
    router.addActivateGuard("admin", () => () => false);

    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("old-admin")).toBe(false);
  });

  it("should return false if target route has async guard (sync check cannot validate)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.addActivateGuard("admin", () => async () => true);
    void router.start();
    void router.navigate("home");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sync check cannot resolve async guards"),
    );

    warnSpy.mockRestore();
  });

  it("should return true for navigating to the same route (no transition needed)", () => {
    void router.start();
    void router.navigate("users");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false when overwritten deactivate guard blocks", () => {
    router.addDeactivateGuard("users", () => () => true);
    router.addDeactivateGuard("users", () => () => false); // overwrites previous

    void router.start();
    void router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);
  });

  it("should return false when overwritten activate guard blocks", () => {
    router.addActivateGuard("admin", () => () => true);
    router.addActivateGuard("admin", () => () => false); // overwrites previous

    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should handle complex nested transitions with mixed guards", () => {
    router.addRoute({ name: "admin.settings", path: "/settings" });

    router.addDeactivateGuard("users.list", () => () => true);
    router.addActivateGuard("admin", () => () => true);
    router.addActivateGuard("admin.settings", () => () => true);

    void router.start();
    void router.navigate("users.list");

    expect(router.canNavigateTo("admin.settings")).toBe(true);
  });

  it("should check guards with params", () => {
    router.addActivateGuard("users.view", () => (toState) => {
      const id = toState.params.id as string;

      return Number.parseInt(id, 10) > 0;
    });

    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("users.view", { id: "123" })).toBe(true);
    expect(router.canNavigateTo("users.view", { id: "0" })).toBe(false);
  });

  it("should return false if guard throws", () => {
    router.addActivateGuard("admin", () => () => {
      throw new Error("Guard error");
    });
    void router.start();
    void router.navigate("home");

    const result = router.canNavigateTo("admin");

    expect(result).toBe(false);
  });

  it("should handle transition from deeply nested route", () => {
    router.addRoute({ name: "admin.settings", path: "/settings" });
    router.addRoute({ name: "admin.settings.profile", path: "/profile" });

    router.addDeactivateGuard("admin.settings.profile", () => () => true);
    router.addDeactivateGuard("admin.settings", () => () => true);
    router.addDeactivateGuard("admin", () => () => true);
    router.addActivateGuard("users", () => () => true);

    void router.start();
    void router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(true);
  });

  it("should return false if any guard in deeply nested path blocks", () => {
    router.addRoute({ name: "admin.settings", path: "/settings" });
    router.addRoute({ name: "admin.settings.profile", path: "/profile" });

    router.addDeactivateGuard("admin.settings.profile", () => () => true);
    router.addDeactivateGuard("admin.settings", () => () => false);
    router.addDeactivateGuard("admin", () => () => true);

    void router.start();
    void router.navigate("admin.settings.profile");

    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should return true when guard calls done() without error", () => {
    router.addActivateGuard("admin", () => (_toState, _fromState) => {
      return true;
    });
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should return false when guard calls done() with error", () => {
    router.addActivateGuard("admin", () => (_toState, _fromState) => {
      return false;
    });
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should return true when guard returns void without calling done()", () => {
    router.addActivateGuard("admin", () => () => {
      // intentionally void — no return, no done()
    });
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should throw TypeError for non-string route name", () => {
    void router.start();

    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(123)).toThrowError(TypeError);
    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(null)).toThrowError(TypeError);
    // @ts-expect-error: testing invalid input
    expect(() => router.canNavigateTo(undefined)).toThrowError(TypeError);
  });

  it("should throw TypeError for whitespace-only route name", () => {
    void router.start();

    expect(() => router.canNavigateTo("   ")).toThrowError(TypeError);
  });

  it("should handle empty params object", () => {
    router.addActivateGuard("admin", () => () => true);
    void router.start();
    void router.navigate("home");

    expect(router.canNavigateTo("admin", {})).toBe(true);
  });

  it("should check guards when no current state", () => {
    router.addActivateGuard("admin", () => () => false);
    void router.start();

    expect(router.canNavigateTo("admin")).toBe(false);
  });

  it("should respect canDeactivate from route config", () => {
    const guard = vi.fn().mockReturnValue(false);

    router.addRoute({
      name: "editor",
      path: "/editor",
      canDeactivate: () => guard,
    });

    void router.start();
    void router.navigate("editor");

    expect(router.canNavigateTo("home")).toBe(false);
    expect(guard).toHaveBeenCalled();
  });
});
