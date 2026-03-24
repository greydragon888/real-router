import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("plugin API validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("makeState validation", () => {
    it("throws TypeError for non-string name", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState(
          n: unknown,
          p?: unknown,
          path?: unknown,
          m?: unknown,
          id?: unknown,
        ): unknown;
      };
      expect(() => raw.makeState(123)).toThrow(TypeError);
      expect(() => raw.makeState(null)).toThrow(TypeError);
    });

    it("throws TypeError for invalid params", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.makeState("home", "string-params")).toThrow(TypeError);
      expect(() => raw.makeState("home", [])).toThrow(TypeError);
    });

    it("throws TypeError for non-string path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState(n: unknown, p?: unknown, path?: unknown): unknown;
      };
      expect(() => raw.makeState("home", {}, 123)).toThrow(TypeError);
    });

    it("throws TypeError for non-number forceId", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState(
          n: unknown,
          p?: unknown,
          path?: unknown,
          m?: unknown,
          id?: unknown,
        ): unknown;
      };
      expect(() => raw.makeState("home", {}, "/home", {}, "string-id")).toThrow(
        TypeError,
      );
    });

    it("accepts valid arguments", () => {
      const api = getPluginApi(router);
      expect(() =>
        api.makeState("home", { foo: "bar" }, "/home"),
      ).not.toThrow();
    });
  });

  describe("buildState validation", () => {
    it("throws TypeError for non-string routeName", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildState(123)).toThrow(TypeError);
      expect(() => raw.buildState(null)).toThrow(TypeError);
    });

    it("throws TypeError for invalid routeParams", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildState("home", "not-object")).toThrow(TypeError);
    });

    it("accepts valid arguments", () => {
      const api = getPluginApi(router);
      expect(() => api.buildState("home", {})).not.toThrow();
    });
  });

  describe("forwardState validation", () => {
    it("throws TypeError for non-string routeName", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        forwardState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.forwardState(123)).toThrow(TypeError);
    });

    it("throws TypeError for invalid routeParams", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        forwardState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.forwardState("home", "not-object")).toThrow(TypeError);
    });

    it("accepts valid arguments", () => {
      const api = getPluginApi(router);
      expect(() => api.forwardState("home", {})).not.toThrow();
    });
  });

  describe("areStatesEqual validation", () => {
    it("throws TypeError for invalid state1", () => {
      const raw = router as unknown as {
        areStatesEqual(s1: unknown, s2: unknown): boolean;
      };
      expect(() => raw.areStatesEqual("not-state", {})).toThrow(TypeError);
    });

    it("throws TypeError for invalid state2", () => {
      const validState = router.getState();
      if (!validState) return;
      const raw = router as unknown as {
        areStatesEqual(s1: unknown, s2: unknown): boolean;
      };
      expect(() => raw.areStatesEqual(validState, "not-state")).toThrow(
        TypeError,
      );
    });

    it("throws TypeError for invalid ignoreQueryParams", () => {
      const validState = router.getState();
      if (!validState) return;
      const raw = router as unknown as {
        areStatesEqual(s1: unknown, s2: unknown, iqp?: unknown): boolean;
      };
      expect(() =>
        raw.areStatesEqual(validState, validState, "not-boolean"),
      ).toThrow(TypeError);
    });
  });

  describe("buildNavigationState validation", () => {
    it("should throw TypeError for non-string routeName", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildNavigationState(123)).toThrow(TypeError);
      expect(() => raw.buildNavigationState(null)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid routeParams (string)", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildNavigationState("home", "string")).toThrow(
        TypeError,
      );
    });

    it("should throw TypeError for invalid routeParams (function)", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildNavigationState("home", () => {})).toThrow(
        TypeError,
      );
    });

    it("should include 'buildNavigationState' in error message", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState(n: unknown, p?: unknown): unknown;
      };
      expect(() => raw.buildNavigationState(123)).toThrow(
        /buildNavigationState/,
      );
    });
  });
});
