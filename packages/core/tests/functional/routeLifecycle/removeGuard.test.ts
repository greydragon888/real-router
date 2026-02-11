import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/removeGuard", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove activate guard and allow navigation", () => {
    router.addActivateGuard("admin", () => () => false);
    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);

    router.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove deactivate guard and allow navigation", () => {
    router.addDeactivateGuard("users", () => () => false);
    router.start();
    router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);

    router.removeDeactivateGuard("users");

    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should allow navigation after removing activate guard", () => {
    router.addActivateGuard("admin", () => () => false);
    router.start();
    router.navigate("home");

    router.removeActivateGuard("admin");

    router.navigate("admin", (err) => {
      expect(err).toBeUndefined();
      expect(router.getState()?.name).toBe("admin");
    });
  });

  it("should allow navigation after removing deactivate guard", () => {
    router.addDeactivateGuard("users", () => () => false);
    router.start();
    router.navigate("users");

    router.removeDeactivateGuard("users");

    router.navigate("home", (err) => {
      expect(err).toBeUndefined();
      expect(router.getState()?.name).toBe("home");
    });
  });

  it("should not throw when removing non-existent activate guard", () => {
    router.start();

    expect(() => {
      router.removeActivateGuard("nonexistent");
    }).not.toThrowError();
  });

  it("should not throw when removing non-existent deactivate guard", () => {
    router.start();

    expect(() => {
      router.removeDeactivateGuard("nonexistent");
    }).not.toThrowError();
  });

  it("should handle re-adding guard after removal", () => {
    router.addActivateGuard("admin", () => () => false);
    router.removeActivateGuard("admin");
    router.addActivateGuard("admin", () => () => true);

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should handle removing then re-adding same guard", () => {
    router.addActivateGuard("admin", () => () => false);
    router.removeActivateGuard("admin");

    router.addActivateGuard("admin", () => () => true);

    router.start();
    router.navigate("admin", (err) => {
      expect(err).toBeUndefined();
      expect(router.getState()?.name).toBe("admin");
    });
  });

  it("should remove all guards for a route", () => {
    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin", () => () => false);

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);

    router.removeActivateGuard("admin");

    expect(router.canNavigateTo("admin")).toBe(true);
  });

  it("should remove only specified route guards", () => {
    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("users", () => () => false);

    router.removeActivateGuard("admin");

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("users")).toBe(false);
  });

  it("should handle removing nested route guards independently", () => {
    router.addRoute({ name: "admin.settings", path: "/settings" });

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.settings", () => () => false);

    router.removeActivateGuard("admin.settings");

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle removing parent guard but keeping child guard", () => {
    router.addRoute({ name: "admin.settings", path: "/settings" });

    router.addActivateGuard("admin", () => () => false);
    router.addActivateGuard("admin.settings", () => () => false);

    router.removeActivateGuard("admin");

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("admin.settings")).toBe(false);
  });

  it("should handle mixed guard types removal", () => {
    router.addActivateGuard("admin", () => () => false);
    router.addDeactivateGuard("users", () => () => false);

    router.removeActivateGuard("admin");
    router.removeDeactivateGuard("users");

    router.start();
    router.navigate("users");

    expect(router.canNavigateTo("admin")).toBe(true);
    expect(router.canNavigateTo("home")).toBe(true);
  });

  it("should handle removing guards before navigation", () => {
    router.addActivateGuard("users", () => () => false);
    router.removeActivateGuard("users");

    router.navigate("users", (err) => {
      expect(err).toBeUndefined();
      expect(router.getState()?.name).toBe("users");
    });
  });

  it("should handle removing guards after router stops", () => {
    router.addActivateGuard("admin", () => () => false);
    router.start();
    router.stop();

    expect(() => {
      router.removeActivateGuard("admin");
    }).not.toThrowError();
  });
});
