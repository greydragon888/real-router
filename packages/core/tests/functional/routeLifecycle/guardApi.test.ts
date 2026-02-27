import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core";

import {
  createLifecycleTestRouter,
  createTestRouter,
  errorCodes,
  type Router,
} from "./setup";

import type { RoutesApi } from "@real-router/core";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/guard-api", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("addActivateGuard", () => {
    it("should register activation guard identical to old canActivate", async () => {
      lifecycle.addActivateGuard("admin", false);

      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toStrictEqual(errorCodes.CANNOT_ACTIVATE);
      }

      expect(router.getState()?.name).not.toBe("admin");
    });

    it("should allow navigation when guard returns true", async () => {
      lifecycle.addActivateGuard("admin", true);

      await router.navigate("admin");

      expect(router.getState()?.name).toBe("admin");
    });

    it("should register guard without throwing", () => {
      lifecycle.addActivateGuard("admin", true);

      expect(router.canNavigateTo("admin")).toBe(true);
    });
  });

  describe("addDeactivateGuard", () => {
    it("should register deactivation guard identical to old canDeactivate", async () => {
      await router.navigate("admin");
      lifecycle.addDeactivateGuard("admin", false);

      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(router.getState()?.name).toBe("admin");
    });

    it("should allow navigation when guard returns true", async () => {
      await router.navigate("admin");
      lifecycle.addDeactivateGuard("admin", true);

      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("should register guard without throwing", () => {
      lifecycle.addDeactivateGuard("admin", true);

      expect(router.canNavigateTo("admin")).toBe(true);
    });
  });

  describe("removeActivateGuard", () => {
    it("removes guard and allows navigation", async () => {
      lifecycle.addActivateGuard("admin", false);
      lifecycle.removeActivateGuard("admin");

      await router.navigate("admin");

      expect(router.getState()?.name).toBe("admin");
    });

    it("skips validation when noValidate is true", async () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      await noValidateRouter.start("/home");
      getLifecycleApi(noValidateRouter).addActivateGuard("admin", false);

      expect(() => {
        getLifecycleApi(noValidateRouter).removeActivateGuard("admin");
      }).not.toThrowError();
    });
  });

  describe("removeDeactivateGuard", () => {
    it("removes guard and allows navigation away", async () => {
      await router.navigate("admin");
      lifecycle.addDeactivateGuard("admin", false);
      lifecycle.removeDeactivateGuard("admin");

      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");
    });

    it("skips validation when noValidate is true", async () => {
      const noValidateRouter = createTestRouter({ noValidate: true });

      await noValidateRouter.start("/home");
      getLifecycleApi(noValidateRouter).addDeactivateGuard("admin", false);

      expect(() => {
        getLifecycleApi(noValidateRouter).removeDeactivateGuard("admin");
      }).not.toThrowError();
    });
  });

  describe("canNavigateTo", () => {
    it("should return true when route has no guards", () => {
      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should return false when activation guard blocks", () => {
      lifecycle.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(false);
    });

    it("should return false for nonexistent route", () => {
      expect(router.canNavigateTo("nonexistent")).toBe(false);
    });

    it("should check full hierarchy for nested routes", () => {
      lifecycle.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin.dashboard")).toBe(false);
    });

    it("should return true when all hierarchy guards pass", () => {
      lifecycle.addActivateGuard("admin", true);
      lifecycle.addActivateGuard("admin.dashboard", true);

      expect(router.canNavigateTo("admin.dashboard")).toBe(true);
    });

    it("should check deactivation guards on current route", async () => {
      await router.navigate("admin");
      lifecycle.addDeactivateGuard("admin", false);

      expect(router.canNavigateTo("home")).toBe(false);
    });

    it("should not modify router state", () => {
      router.navigate("home").catch(() => {});
      const stateBefore = router.getState();

      router.canNavigateTo("admin");

      expect(router.getState()).toBe(stateBefore);
    });

    it("should handle forwarded routes", async () => {
      await router.navigate("admin");
      routesApi.add({ name: "old", path: "/old", forwardTo: "home" });
      lifecycle.addActivateGuard("home", false);

      expect(router.canNavigateTo("old")).toBe(false);
    });

    it("should return false for async guard with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      lifecycle.addActivateGuard("admin", () => () => Promise.resolve(true));

      expect(router.canNavigateTo("admin")).toBe(false);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should work with params", () => {
      lifecycle.addActivateGuard("users.view", false);

      expect(router.canNavigateTo("users.view", { id: "123" })).toBe(false);
    });

    it("should return true with no params when route has no guards", () => {
      expect(router.canNavigateTo("home")).toBe(true);
    });
  });
});
