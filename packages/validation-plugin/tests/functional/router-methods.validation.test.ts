import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router methods validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("buildPath validation", () => {
    it("should throw TypeError when route is undefined", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError when route is null", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath(null)).toThrow(TypeError);
    });

    it("should throw TypeError when route is not a string", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath(123)).toThrow(TypeError);
      expect(() => raw.buildPath({})).toThrow(TypeError);
    });

    it("should reject Cyrillic route names (ASCII only)", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath("путь")).toThrow(TypeError);
    });

    it("should reject emoji route names", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath("🏠")).toThrow(TypeError);
    });

    it("should reject route names with unicode characters", () => {
      const raw = router as unknown as { buildPath(r: unknown): string };
      expect(() => raw.buildPath("ñame")).toThrow(TypeError);
    });

    it("should accept valid route name", () => {
      expect(() => router.buildPath("home")).not.toThrow();
    });
  });

  describe("isActiveRoute validation", () => {
    it("should throw on invalid params structure", () => {
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", "not-object")).toThrow();
    });

    it("should throw when params contain a function", () => {
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", { fn: () => {} })).toThrow();
    });

    it("should throw when params contain circular reference", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", circular)).toThrow();
    });

    it("should throw when params contain class instance", () => {
      class Foo {}
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", new Foo())).toThrow();
    });

    it("should throw on non-boolean strictEquality", () => {
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown, s: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", {}, "not-boolean")).toThrow();
    });

    it("should throw on non-boolean ignoreQueryParams", () => {
      const raw = router as unknown as {
        isActiveRoute(
          n: string,
          p: unknown,
          s?: unknown,
          iqp?: unknown,
        ): boolean;
      };
      expect(() =>
        raw.isActiveRoute("home", {}, undefined, "not-boolean"),
      ).toThrow();
    });

    it("should reject Object.create() params with custom prototype", () => {
      const protoParams = Object.create({ custom: true });
      const raw = router as unknown as {
        isActiveRoute(n: string, p: unknown): boolean;
      };
      expect(() => raw.isActiveRoute("home", protoParams)).toThrow();
    });

    it("should accept valid params", () => {
      expect(() => router.isActiveRoute("home", {})).not.toThrow();
    });
  });

  describe("matchPath validation", () => {
    it("should throw TypeError for null path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath(p: unknown): unknown };
      expect(() => raw.matchPath(null)).toThrow(TypeError);
    });

    it("should throw TypeError for undefined path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath(p: unknown): unknown };
      expect(() => raw.matchPath(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError for number path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath(p: unknown): unknown };
      expect(() => raw.matchPath(123)).toThrow(TypeError);
    });

    it("should throw TypeError for object path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath(p: unknown): unknown };
      expect(() => raw.matchPath({})).toThrow(TypeError);
    });

    it("should accept valid string path", () => {
      const api = getPluginApi(router);
      expect(() => api.matchPath("/home")).not.toThrow();
    });
  });

  describe("shouldUpdateNode validation", () => {
    it("should throw TypeError when nodeName is not a string (number)", () => {
      const raw = router as unknown as {
        shouldUpdateNode(n: unknown): boolean;
      };
      expect(() => raw.shouldUpdateNode(123)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is null", () => {
      const raw = router as unknown as {
        shouldUpdateNode(n: unknown): boolean;
      };
      expect(() => raw.shouldUpdateNode(null)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is undefined", () => {
      const raw = router as unknown as {
        shouldUpdateNode(n: unknown): boolean;
      };
      expect(() => raw.shouldUpdateNode(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is an object", () => {
      const raw = router as unknown as {
        shouldUpdateNode(n: unknown): boolean;
      };
      expect(() => raw.shouldUpdateNode({})).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is an array", () => {
      const raw = router as unknown as {
        shouldUpdateNode(n: unknown): boolean;
      };
      expect(() => raw.shouldUpdateNode(["home"])).toThrow(TypeError);
    });

    it("should accept valid string nodeName", () => {
      expect(() => router.shouldUpdateNode("")).not.toThrow();
    });
  });

  describe("canNavigateTo validation", () => {
    it("should throw TypeError for non-string route name", () => {
      const raw = router as unknown as {
        canNavigateTo(n: unknown): boolean;
      };
      expect(() => raw.canNavigateTo(123)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only route name", () => {
      const raw = router as unknown as {
        canNavigateTo(n: unknown): boolean;
      };
      expect(() => raw.canNavigateTo("   ")).toThrow(TypeError);
    });

    it("should accept valid route name", () => {
      expect(() => router.canNavigateTo("home")).not.toThrow();
    });
  });
});
