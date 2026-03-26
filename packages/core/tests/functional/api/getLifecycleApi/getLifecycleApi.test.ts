import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("getLifecycleApi", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("invalid router", () => {
    it("should throw TypeError for non-router object", () => {
      expect(() => getLifecycleApi({} as Router)).toThrow(TypeError);
      expect(() => getLifecycleApi({} as Router)).toThrow(
        "not found in internals registry",
      );
    });
  });

  describe("addActivateGuard", () => {
    it("should register a factory guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", () => () => true);
      }).not.toThrow();
    });

    it("should register a boolean true guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", true);
      }).not.toThrow();
    });

    it("should register a boolean false guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", false);
      }).not.toThrow();
    });

    it("should register guard that blocks navigation (returns void)", () => {
      lifecycle.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(false);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.addActivateGuard("home", true);
      }).toThrow(errorCodes.ROUTER_DISPOSED);
    });

    it("should work without validation plugin (any route name)", () => {
      const noValidateRouter = createTestRouter();
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.addActivateGuard("route/name", true);
      }).not.toThrow();

      noValidateRouter.stop();
    });
  });

  describe("addDeactivateGuard", () => {
    it("should register a factory guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", () => () => true);
      }).not.toThrow();
    });

    it("should register a boolean true guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", true);
      }).not.toThrow();
    });

    it("should register a boolean false guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", false);
      }).not.toThrow();
    });

    it("should not affect activate guards when registering deactivate guard (returns void)", () => {
      lifecycle.addDeactivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.addDeactivateGuard("home", true);
      }).toThrow(errorCodes.ROUTER_DISPOSED);
    });

    it("should work without validation plugin (any route name)", () => {
      const noValidateRouter = createTestRouter();
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.addDeactivateGuard("route/name", true);
      }).not.toThrow();

      noValidateRouter.stop();
    });
  });

  describe("removeActivateGuard", () => {
    it("should remove a registered guard without throwing", () => {
      lifecycle.addActivateGuard("home", true);

      expect(() => {
        lifecycle.removeActivateGuard("home");
      }).not.toThrow();
    });

    it("should make route navigable after clearing blocking guard (returns void)", () => {
      lifecycle.addActivateGuard("admin", false);
      lifecycle.removeActivateGuard("admin");

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.removeActivateGuard("home");
      }).toThrow(errorCodes.ROUTER_DISPOSED);
    });

    it("should work without validation plugin (any route name)", () => {
      const noValidateRouter = createTestRouter();
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.removeActivateGuard("route/name");
      }).not.toThrow();

      noValidateRouter.stop();
    });
  });

  describe("removeDeactivateGuard", () => {
    it("should remove a registered guard without throwing", () => {
      lifecycle.addDeactivateGuard("home", true);

      expect(() => {
        lifecycle.removeDeactivateGuard("home");
      }).not.toThrow();
    });

    it("should not affect activate guards after clearing deactivate guard (returns void)", () => {
      lifecycle.addDeactivateGuard("admin", false);
      lifecycle.removeDeactivateGuard("admin");

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.removeDeactivateGuard("home");
      }).toThrow(errorCodes.ROUTER_DISPOSED);
    });

    it("should skip validation in noValidate mode", () => {
      const noValidateRouter = createTestRouter();
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.removeDeactivateGuard("route/name");
      }).not.toThrow();

      noValidateRouter.stop();
    });
  });

  describe("integration", () => {
    it("should block navigation when activate guard returns false", async () => {
      lifecycle.addActivateGuard("admin", false);

      await router.start("/home");

      let err: any;

      try {
        await router.navigate("admin");
      } catch (error) {
        err = error;
      }

      expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    });

    it("should allow navigation after removeActivateGuard", async () => {
      lifecycle.addActivateGuard("admin", false);
      lifecycle.removeActivateGuard("admin");

      await router.start("/home");

      const state = await router.navigate("admin");

      expect(state.name).toBe("admin");
    });

    it("should block navigation when deactivate guard returns false", async () => {
      await router.start("/home");
      await router.navigate("admin");

      lifecycle.addDeactivateGuard("admin", false);

      let err: any;

      try {
        await router.navigate("home");
      } catch (error) {
        err = error;
      }

      expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    });

    it("should allow navigation after removeDeactivateGuard", async () => {
      await router.start("/home");
      await router.navigate("admin");

      lifecycle.addDeactivateGuard("admin", false);
      lifecycle.removeDeactivateGuard("admin");

      const state = await router.navigate("home");

      expect(state.name).toBe("home");
    });
  });
});
