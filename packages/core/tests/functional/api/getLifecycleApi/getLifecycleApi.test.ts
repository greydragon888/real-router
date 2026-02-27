import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, LifecycleApi } from "@real-router/core";

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
      expect(() => getLifecycleApi({} as Router)).toThrowError(TypeError);
      expect(() => getLifecycleApi({} as Router)).toThrowError(
        "not found in internals registry",
      );
    });
  });

  describe("addActivateGuard", () => {
    it("should register a factory guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", () => () => true);
      }).not.toThrowError();
    });

    it("should register a boolean true guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", true);
      }).not.toThrowError();
    });

    it("should register a boolean false guard without throwing", () => {
      expect(() => {
        lifecycle.addActivateGuard("home", false);
      }).not.toThrowError();
    });

    it("should register guard that blocks navigation (returns void)", () => {
      lifecycle.addActivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(false);
    });

    it("should throw TypeError for invalid route name", () => {
      expect(() => {
        // @ts-expect-error: testing null route name
        lifecycle.addActivateGuard(null, true);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid handler", () => {
      expect(() => {
        // @ts-expect-error: testing null handler
        lifecycle.addActivateGuard("home", null);
      }).toThrowError(TypeError);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.addActivateGuard("home", true);
      }).toThrowError(errorCodes.ROUTER_DISPOSED);
    });

    it("should skip validation in noValidate mode", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.addActivateGuard("route/name", true);
      }).not.toThrowError();

      noValidateRouter.stop();
    });
  });

  describe("addDeactivateGuard", () => {
    it("should register a factory guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", () => () => true);
      }).not.toThrowError();
    });

    it("should register a boolean true guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", true);
      }).not.toThrowError();
    });

    it("should register a boolean false guard without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("home", false);
      }).not.toThrowError();
    });

    it("should not affect activate guards when registering deactivate guard (returns void)", () => {
      lifecycle.addDeactivateGuard("admin", false);

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw TypeError for invalid route name", () => {
      expect(() => {
        // @ts-expect-error: testing null route name
        lifecycle.addDeactivateGuard(null, true);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid handler", () => {
      expect(() => {
        // @ts-expect-error: testing null handler
        lifecycle.addDeactivateGuard("home", null);
      }).toThrowError(TypeError);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.addDeactivateGuard("home", true);
      }).toThrowError(errorCodes.ROUTER_DISPOSED);
    });

    it("should skip validation in noValidate mode", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.addDeactivateGuard("route/name", true);
      }).not.toThrowError();

      noValidateRouter.stop();
    });
  });

  describe("removeActivateGuard", () => {
    it("should remove a registered guard without throwing", () => {
      lifecycle.addActivateGuard("home", true);

      expect(() => {
        lifecycle.removeActivateGuard("home");
      }).not.toThrowError();
    });

    it("should make route navigable after clearing blocking guard (returns void)", () => {
      lifecycle.addActivateGuard("admin", false);
      lifecycle.removeActivateGuard("admin");

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw TypeError for invalid route name", () => {
      expect(() => {
        // @ts-expect-error: testing null route name
        lifecycle.removeActivateGuard(null);
      }).toThrowError(TypeError);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.removeActivateGuard("home");
      }).toThrowError(errorCodes.ROUTER_DISPOSED);
    });

    it("should skip validation in noValidate mode", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.removeActivateGuard("route/name");
      }).not.toThrowError();

      noValidateRouter.stop();
    });
  });

  describe("removeDeactivateGuard", () => {
    it("should remove a registered guard without throwing", () => {
      lifecycle.addDeactivateGuard("home", true);

      expect(() => {
        lifecycle.removeDeactivateGuard("home");
      }).not.toThrowError();
    });

    it("should not affect activate guards after clearing deactivate guard (returns void)", () => {
      lifecycle.addDeactivateGuard("admin", false);
      lifecycle.removeDeactivateGuard("admin");

      expect(router.canNavigateTo("admin")).toBe(true);
    });

    it("should throw TypeError for invalid route name", () => {
      expect(() => {
        // @ts-expect-error: testing null route name
        lifecycle.removeDeactivateGuard(null);
      }).toThrowError(TypeError);
    });

    it("should throw ROUTER_DISPOSED after dispose", () => {
      const freshRouter = createTestRouter();
      const freshLifecycle = getLifecycleApi(freshRouter);

      freshRouter.dispose();

      expect(() => {
        freshLifecycle.removeDeactivateGuard("home");
      }).toThrowError(errorCodes.ROUTER_DISPOSED);
    });

    it("should skip validation in noValidate mode", () => {
      const noValidateRouter = createTestRouter({ noValidate: true });
      const noValidateLifecycle = getLifecycleApi(noValidateRouter);

      expect(() => {
        noValidateLifecycle.removeDeactivateGuard("route/name");
      }).not.toThrowError();

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
