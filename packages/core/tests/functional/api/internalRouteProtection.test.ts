import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { LifecycleApi, Router, RoutesApi } from "@real-router/core";

const INTERNAL_NAME = "@@router/UNKNOWN_ROUTE";
const INTERNAL_CHILD = "@@custom/system-route";

let router: Router;
let routesApi: RoutesApi;
let lifecycle: LifecycleApi;

describe("core/internal-route-protection", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    lifecycle = getLifecycleApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("getRoutesApi - blocked operations", () => {
    it("should throw when adding a route with @@ prefix", () => {
      expect(() => {
        routesApi.add({ name: INTERNAL_NAME, path: "/system" });
      }).toThrowError(/reserved "@@" prefix/);
    });

    it("should throw when adding routes with @@ prefix in children", () => {
      expect(() => {
        routesApi.add({
          name: "parent",
          path: "/parent",
          children: [{ name: INTERNAL_CHILD, path: "/child" }],
        });
      }).toThrowError(/reserved "@@" prefix/);
    });

    it("should throw when removing a route with @@ prefix", () => {
      expect(() => {
        routesApi.remove(INTERNAL_NAME);
      }).toThrowError(/reserved "@@" prefix/);
    });

    it("should throw when updating a route with @@ prefix", () => {
      expect(() => {
        routesApi.update(INTERNAL_NAME, { defaultParams: { a: "1" } });
      }).toThrowError(/reserved "@@" prefix/);
    });

    it("should throw when replacing routes with @@ prefix", () => {
      expect(() => {
        routesApi.replace([
          { name: "home", path: "/home" },
          { name: INTERNAL_NAME, path: "/system" },
        ]);
      }).toThrowError(/reserved "@@" prefix/);
    });

    it("should throw when replacing routes with @@ prefix in children", () => {
      expect(() => {
        routesApi.replace([
          {
            name: "parent",
            path: "/parent",
            children: [{ name: INTERNAL_CHILD, path: "/child" }],
          },
        ]);
      }).toThrowError(/reserved "@@" prefix/);
    });
  });

  describe("allowed operations on @@ prefix routes", () => {
    it("should allow read operations (has, get, getConfig)", () => {
      expect(() => routesApi.has(INTERNAL_NAME)).not.toThrowError();
      expect(() => routesApi.get(INTERNAL_NAME)).not.toThrowError();
      expect(() => routesApi.getConfig(INTERNAL_NAME)).not.toThrowError();
    });

    it("should allow adding guards for @@ prefix routes", () => {
      expect(() => {
        lifecycle.addActivateGuard(INTERNAL_NAME, () => () => true);
      }).not.toThrowError();

      expect(() => {
        lifecycle.addDeactivateGuard(INTERNAL_NAME, () => () => true);
      }).not.toThrowError();
    });

    it("should allow removing guards for @@ prefix routes", () => {
      expect(() => {
        lifecycle.removeActivateGuard(INTERNAL_NAME);
      }).not.toThrowError();

      expect(() => {
        lifecycle.removeDeactivateGuard(INTERNAL_NAME);
      }).not.toThrowError();
    });
  });

  describe("noValidate bypasses internal route checks", () => {
    let noValidateRouter: Router;
    let noValidateRoutes: RoutesApi;

    beforeEach(async () => {
      noValidateRouter = createTestRouter({ noValidate: true });
      noValidateRoutes = getRoutesApi(noValidateRouter);
      await noValidateRouter.start("/home");
    });

    afterEach(() => {
      noValidateRouter.stop();
    });

    it("should allow adding @@ route when noValidate is true", () => {
      expect(() => {
        noValidateRoutes.add({ name: INTERNAL_NAME, path: "/system" });
      }).not.toThrowError();
    });
  });

  describe("error messages include method name", () => {
    it("should include addRoute in error message", () => {
      expect(() => {
        routesApi.add({ name: INTERNAL_NAME, path: "/x" });
      }).toThrowError("[router.addRoute]");
    });

    it("should include removeRoute in error message", () => {
      expect(() => {
        routesApi.remove(INTERNAL_NAME);
      }).toThrowError("[router.removeRoute]");
    });

    it("should include updateRoute in error message", () => {
      expect(() => {
        routesApi.update(INTERNAL_NAME, {});
      }).toThrowError("[router.updateRoute]");
    });

    it("should include replaceRoutes in error message", () => {
      expect(() => {
        routesApi.replace([{ name: INTERNAL_NAME, path: "/x" }]);
      }).toThrowError("[router.replaceRoutes]");
    });
  });
});
