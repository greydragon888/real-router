/* eslint-disable sonarjs/deprecation, @typescript-eslint/no-deprecated */
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createLifecycleTestRouter, type Router } from "./setup";

let router: Router;

describe("core/route-lifecycle/deprecated-methods", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should emit deprecation warning when using canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => () => true);

    expect(warnSpy).toHaveBeenCalledWith(
      "router.canActivate() is deprecated. Use router.addActivateGuard() instead.",
    );

    warnSpy.mockRestore();
  });

  it("should emit deprecation warning when using canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canDeactivate("users", () => () => true);

    expect(warnSpy).toHaveBeenCalledWith(
      "router.canDeactivate() is deprecated. Use router.addDeactivateGuard() instead.",
    );

    warnSpy.mockRestore();
  });

  it("should still function correctly with deprecated canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => () => false);
    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);

    warnSpy.mockRestore();
  });

  it("should still function correctly with deprecated canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canDeactivate("users", () => () => false);
    router.start();
    router.navigate("users");

    expect(router.canNavigateTo("home")).toBe(false);

    warnSpy.mockRestore();
  });

  it("should allow navigation with deprecated canActivate returning true", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", true);
    router.start();

    router.navigate("admin", (err) => {
      expect(err).toBeUndefined();
      expect(router.getState()?.name).toBe("admin");
    });

    warnSpy.mockRestore();
  });

  it("should block navigation with deprecated canActivate returning false", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", false);
    router.start();

    router.navigate("admin", (err) => {
      expect(err).toBeDefined();
      expect(router.getState()?.name).not.toBe("admin");
    });

    warnSpy.mockRestore();
  });

  it("should emit warning only once per call", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => () => true);
    router.canActivate("users", () => () => true);

    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("should work with guard factories in deprecated canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let guardCalled = false;

    router.canActivate("admin", () => {
      guardCalled = true;

      return () => true;
    });

    router.start();
    router.navigate("admin");

    expect(guardCalled).toBe(true);

    warnSpy.mockRestore();
  });

  it("should work with guard factories in deprecated canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let guardCalled = false;

    router.canDeactivate("users", () => {
      guardCalled = true;

      return () => true;
    });

    router.start();
    router.navigate("users");
    router.navigate("home");

    expect(guardCalled).toBe(true);

    warnSpy.mockRestore();
  });

  it("should override previous guards with deprecated methods", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => () => false);
    router.canActivate("admin", () => () => true);

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(true);

    warnSpy.mockRestore();
  });

  it("should mix deprecated and new methods", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => () => false);
    router.addActivateGuard("users", () => () => true);

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin")).toBe(false);
    expect(router.canNavigateTo("users")).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("should handle nested routes with deprecated methods", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.addRoute({ name: "admin.settings", path: "/settings" });

    router.canActivate("admin", () => () => true);
    router.canActivate("admin.settings", () => () => false);

    router.start();
    router.navigate("home");

    expect(router.canNavigateTo("admin.settings")).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("should work with async guards in deprecated canActivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canActivate("admin", () => async () => true);

    router.start();
    router.navigate("admin", (err) => {
      expect(err).toBeUndefined();
    });

    warnSpy.mockRestore();
  });

  it("should work with promise-returning guards in deprecated canDeactivate", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.canDeactivate("users", () => () => Promise.resolve(true));

    router.start();
    router.navigate("users");
    router.navigate("home", (err) => {
      expect(err).toBeUndefined();
    });

    warnSpy.mockRestore();
  });
});
