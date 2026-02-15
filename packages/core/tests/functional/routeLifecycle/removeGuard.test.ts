import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/removeGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove activate guard and allow navigation", async () => {
    router.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);

    router.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove deactivate guard and allow navigation", async () => {
    router.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);

    router.removeDeactivateGuard("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should allow navigation after removing activate guard", async () => {
    router.addActivateGuard("admin", () => () => false);
    await router.navigate("index");

    router.removeActivateGuard("admin");

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });

  it("should allow navigation after removing deactivate guard", async () => {
    router.addDeactivateGuard("users", () => () => false);
    await router.navigate("users");

    router.removeDeactivateGuard("users");

    const state = await router.navigate("home");

    expect(state.name).toBe("home");
  });

  it("should not throw when removing non-existent activate guard", () => {
    expect(() => {
      router.removeActivateGuard("nonexistent");
    }).not.toThrowError();
  });

  it("should not throw when removing non-existent deactivate guard", () => {
    expect(() => {
      router.removeDeactivateGuard("nonexistent");
    }).not.toThrowError();
  });

  it("should handle re-adding guard after removal", async () => {
    router.addActivateGuard("admin", () => () => false);
    router.removeActivateGuard("admin");
    router.addActivateGuard("admin", () => () => true);

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should handle removing then re-adding same guard", async () => {
    router.addActivateGuard("admin", () => () => false);
    router.removeActivateGuard("admin");

    router.addActivateGuard("admin", () => () => true);

    const state = await router.navigate("admin");

    expect(state.name).toBe("admin");
  });

  it("should remove all guards for a route", async () => {
    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin", () => () => false);

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);

    router.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove only specified route guards", async () => {
    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("users", () => () => false);

    router.removeActivateGuard("admin");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should handle removing nested route guards independently", async () => {
    router.addRoute(
      { name: "settings", path: "/settings" },
      { parent: "admin" },
    );

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.settings", () => () => false);

    router.removeActivateGuard("admin.settings");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(false);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle removing parent guard but keeping child guard", async () => {
    router.addRoute(
      { name: "settings", path: "/settings" },
      { parent: "admin" },
    );

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.settings", () => () => false);

    router.removeActivateGuard("admin");

    await router.navigate("index");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle mixed guard types removal", async () => {
    router.addActivateGuard("admin", () => () => false);
    router.addDeactivateGuard("users", () => () => false);

    router.removeActivateGuard("admin");
    router.removeDeactivateGuard("users");

    await router.navigate("users");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should handle removing guards before navigation", async () => {
    router.addActivateGuard("users", () => () => false);
    router.removeActivateGuard("users");

    const state = await router.navigate("users");

    expect(state.name).toBe("users");
  });

  it("should handle removing guards after router stops", () => {
    router.addActivateGuard("admin", () => () => false);
    router.stop();

    expect(() => {
      router.removeActivateGuard("admin");
    }).not.toThrowError();
  });
});
