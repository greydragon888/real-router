import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  createTestRouter,
  errorCodes,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/guard-api", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("addActivateGuard", () => {
    it("should register activation guard identical to old canActivate", async () => {
      router.addActivateGuard("admin", false);

      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toStrictEqual(errorCodes.CANNOT_ACTIVATE);
      }

      expect(router.getState()?.name).not.toBe("admin");
    });

    it("should allow navigation when guard returns true", async () => {
      router.addActivateGuard("admin", true);

      await router.navigate("admin");

      expect(router.getState()?.name).toBe("admin");
    });

    it("should return this for chaining", () => {
      const result = router.addActivateGuard("admin", true);

      expect(result).toBe(router);
    });
  });

  describe("addDeactivateGuard", () => {
    it("should register deactivation guard identical to old canDeactivate", async () => {
      await router.navigate("admin");
      router.addDeactivateGuard("admin", false);

      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(router.getState()?.name).toBe("admin");
    });

    it("should allow navigation when guard returns true", async () => {
      await router.navigate("admin");
      router.addDeactivateGuard("admin", true);

      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should return this for chaining", () => {
      const result = router.addDeactivateGuard("admin", true);

      expect(result).toBe(router);
    });
  });

  describe("removeActivateGuard", () => {
    it("removes guard and allows navigation", async () => {
      router.addActivateGuard("admin", false);
      router.removeActivateGuard("admin");

      await router.navigate("admin");

      expect(router.getState()?.name).toBe("admin");
    });

    it("skips validation when noValidate is true", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      noValidateRouter.start();
      noValidateRouter.addActivateGuard("admin", false);

      expect(() => {
        noValidateRouter.removeActivateGuard("admin");
      }).not.toThrowError();
    });
  });

  describe("removeDeactivateGuard", () => {
    it("removes guard and allows navigation away", async () => {
      await router.navigate("admin");
      router.addDeactivateGuard("admin", false);
      router.removeDeactivateGuard("admin");

      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("skips validation when noValidate is true", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      noValidateRouter.start();
      noValidateRouter.addDeactivateGuard("admin", false);

      expect(() => {
        noValidateRouter.removeDeactivateGuard("admin");
      }).not.toThrowError();
    });
  });

  describe("canNavigateTo", () => {
    it("should return true when route has no guards", () => {
      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should return false when activation guard blocks", () => {
      router.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(false);
    });

    it("should return false for nonexistent route", () => {
      expect(router.canNavigateTo("nonexistent")).toBe(false);
    });

    it("should check full hierarchy for nested routes", () => {
      router.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin.dashboard")).toBe(false);
    });

    it("should return true when all hierarchy guards pass", () => {
      router.addActivateGuard("admin", true);
      router.addActivateGuard("admin.dashboard", true);

      expect(router.canNavigateTo("admin.dashboard")).toBe(true);
    });

    it("should check deactivation guards on current route", () => {
      void router.navigate("admin");
      router.addDeactivateGuard("admin", false);

      expect(router.canNavigateTo("home")).toBe(false);
    });

    it("should not modify router state", () => {
      void router.navigate("home");
      const stateBefore = router.getState();

      router.canNavigateTo("admin");

      expect(router.getState()).toBe(stateBefore);
    });

    it("should handle forwarded routes", () => {
      void router.navigate("admin");
      router.addRoute({ name: "old", path: "/old", forwardTo: "home" });
      router.addActivateGuard("home", false);

      expect(router.canNavigateTo("old")).toBe(false);
    });

    it("should return false for async guard with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router.addActivateGuard("admin", () => () => Promise.resolve(true));

      expect(router.canNavigateTo("admin")).toBe(false);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should work with params", () => {
      router.addActivateGuard("users.view", false);

      expect(router.canNavigateTo("users.view", { id: "123" })).toBe(false);
    });

    it("should return true with no params when route has no guards", () => {
      expect(router.canNavigateTo("home")).toBe(true);
    });
  });
});
