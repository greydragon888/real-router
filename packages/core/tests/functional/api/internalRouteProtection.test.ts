import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi, RoutesApi } from "@real-router/core/api";

const INTERNAL_NAME = "@@router/UNKNOWN_ROUTE";

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

  describe("allowed operations on @@ prefix routes", () => {
    it("should allow read operations (has, get, getRouteConfig)", () => {
      expect(() => routesApi.has(INTERNAL_NAME)).not.toThrow();
      expect(() => routesApi.get(INTERNAL_NAME)).not.toThrow();
      expect(() =>
        getPluginApi(router).getRouteConfig(INTERNAL_NAME),
      ).not.toThrow();
    });

    it("should allow adding guards for @@ prefix routes", () => {
      expect(() => {
        lifecycle.addActivateGuard(INTERNAL_NAME, () => () => true);
      }).not.toThrow();

      expect(() => {
        lifecycle.addDeactivateGuard(INTERNAL_NAME, () => () => true);
      }).not.toThrow();
    });

    it("should allow removing guards for @@ prefix routes", () => {
      expect(() => {
        lifecycle.removeActivateGuard(INTERNAL_NAME);
      }).not.toThrow();

      expect(() => {
        lifecycle.removeDeactivateGuard(INTERNAL_NAME);
      }).not.toThrow();
    });
  });

  describe("no validation plugin - @@ routes rejected (#954)", () => {
    // Core rejects reserved "@@"-prefixed names even without the validation
    // plugin: registering one would let a real URL match a state whose
    // `name === UNKNOWN_ROUTE`, silently conflating a genuine route with the
    // not-found sentinel. The error mirrors validation-plugin's message.
    it("should reject adding a reserved @@ route name without the validation plugin", () => {
      expect(() => {
        routesApi.add({ name: INTERNAL_NAME, path: "/system" });
      }).toThrow(
        `[router.addRoute] Route name "${INTERNAL_NAME}" uses the reserved "@@" prefix. Routes with this prefix are internal and cannot be modified through the public API.`,
      );
    });
  });
});
