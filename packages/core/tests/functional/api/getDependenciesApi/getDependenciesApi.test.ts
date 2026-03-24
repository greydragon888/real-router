import { describe, beforeEach, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/core/api";

interface Deps {
  foo?: number;
  bar?: string;
}

let router: Router<Deps>;
let deps: DependenciesApi<Deps>;

describe("getDependenciesApi", () => {
  beforeEach(() => {
    router = createRouter<Deps>([], {}, { foo: 1 });
    deps = getDependenciesApi(router);
  });

  describe("invalid router", () => {
    it("should throw TypeError for non-router object", () => {
      expect(() => getDependenciesApi({} as Router)).toThrow(TypeError);
      expect(() => getDependenciesApi({} as Router)).toThrow(
        "not found in internals registry",
      );
    });
  });

  describe("get", () => {
    it("should return existing dependency", () => {
      expect(deps.get("foo")).toBe(1);
    });

    it("should return undefined for missing dependency", () => {
      expect(deps.has("bar")).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return shallow copy of all dependencies", () => {
      const all = deps.getAll();

      expect(all).toStrictEqual({ foo: 1 });
      expect(all).not.toBe(deps.getAll());
    });
  });

  describe("set", () => {
    it("should set a dependency", () => {
      deps.set("bar", "hello");

      expect(deps.get("bar")).toBe("hello");
    });

    it("should return void", () => {
      deps.set("bar", "hello");

      expect(deps.get("bar")).toBe("hello");
    });

    it("should ignore undefined value for set", () => {
      deps.set("bar", undefined);

      expect(deps.has("bar")).toBe(false);
    });
  });

  describe("setAll", () => {
    it("should set multiple dependencies", () => {
      deps.setAll({ foo: 42, bar: "test" });

      expect(deps.get("foo")).toBe(42);
      expect(deps.get("bar")).toBe("test");
    });

    it("should handle empty setAll without changes", () => {
      deps.setAll({});

      expect(deps.get("foo")).toBe(1);
    });
  });

  describe("remove", () => {
    it("should remove a dependency", () => {
      deps.remove("foo");

      expect(deps.has("foo")).toBe(false);
    });
  });

  describe("reset", () => {
    it("should clear all dependencies", () => {
      deps.reset();

      expect(deps.getAll()).toStrictEqual({});
    });
  });

  describe("has", () => {
    it("should return true for existing dependency", () => {
      expect(deps.has("foo")).toBe(true);
    });

    it("should return false for missing dependency", () => {
      expect(deps.has("bar")).toBe(false);
    });
  });

  describe("after dispose", () => {
    it("should throw ROUTER_DISPOSED for mutating methods", () => {
      router.dispose();
      const depsAfterDispose = getDependenciesApi(router);

      expect(() => {
        depsAfterDispose.set("bar", "x");
      }).toThrow(errorCodes.ROUTER_DISPOSED);
      expect(() => {
        depsAfterDispose.setAll({ foo: 2 });
      }).toThrow(errorCodes.ROUTER_DISPOSED);
      expect(() => {
        depsAfterDispose.remove("foo");
      }).toThrow(errorCodes.ROUTER_DISPOSED);
      expect(() => {
        depsAfterDispose.reset();
      }).toThrow(errorCodes.ROUTER_DISPOSED);
    });

    it("should still allow read-only methods after dispose", () => {
      router.dispose();
      const depsAfterDispose = getDependenciesApi(router);

      expect(depsAfterDispose.has("foo")).toBe(false);
      expect(depsAfterDispose.getAll()).toStrictEqual({});
    });
  });
});
