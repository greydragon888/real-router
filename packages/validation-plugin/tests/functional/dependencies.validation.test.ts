import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

interface TestDeps {
  foo?: number;
  bar?: string;
}

let router: Router<TestDeps>;

describe("dependencies validation — with validationPlugin", () => {
  beforeEach(() => {
    router = createRouter<TestDeps>([], {}, { foo: 1 });
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
  });

  describe("setDependency validation", () => {
    it("should throw TypeError for non-string keys", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { set: (k: unknown, v: unknown) => void };

      expect(() => {
        raw.set(123, "value");
      }).toThrow(TypeError);
      expect(() => {
        raw.set(123, "value");
      }).toThrow("dependency name must be a string, got number");
    });

    it("should throw TypeError for null key", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { set: (k: unknown, v: unknown) => void };

      expect(() => {
        raw.set(null, "value");
      }).toThrow(TypeError);
      expect(() => {
        raw.set(null, "value");
      }).toThrow("dependency name must be a string, got object");
    });

    it("should throw TypeError for object key", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { set: (k: unknown, v: unknown) => void };

      expect(() => {
        raw.set({}, "value");
      }).toThrow(TypeError);
    });

    it("should throw TypeError for invalid key even when value is undefined", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { set: (k: unknown, v: unknown) => void };

      expect(() => {
        raw.set(null, undefined);
      }).toThrow(TypeError);
      expect(() => {
        raw.set(123, undefined);
      }).toThrow(TypeError);
      expect(() => {
        raw.set({}, undefined);
      }).toThrow(TypeError);
    });

    it("should allow valid string key", () => {
      const deps = getDependenciesApi(router);

      expect(() => {
        deps.set("foo", 2);
      }).not.toThrow();
    });
  });

  describe("setDependencies (setAll) validation", () => {
    it("should reject null with TypeError", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { setAll: (v: unknown) => void };

      expect(() => {
        raw.setAll(null);
      }).toThrow(TypeError);
      expect(() => {
        raw.setAll(null);
      }).toThrow(/expected plain object/);
    });

    it("should reject arrays with TypeError", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { setAll: (v: unknown) => void };

      expect(() => {
        raw.setAll([]);
      }).toThrow(TypeError);
      expect(() => {
        raw.setAll(["a", "b"]);
      }).toThrow(/expected plain object/);
    });

    it("should reject class instances with TypeError", () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class MyClass {}
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { setAll: (v: unknown) => void };

      expect(() => {
        raw.setAll(new MyClass());
      }).toThrow(TypeError);
    });

    it("should reject Date objects with TypeError", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { setAll: (v: unknown) => void };

      expect(() => {
        raw.setAll(new Date());
      }).toThrow(TypeError);
    });

    it("should reject objects with getters", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { setAll: (v: unknown) => void };
      const objWithGetter = {};

      Object.defineProperty(objWithGetter, "key", {
        get: () => "value",
        enumerable: true,
      });

      expect(() => {
        raw.setAll(objWithGetter);
      }).toThrow(TypeError);
      expect(() => {
        raw.setAll(objWithGetter);
      }).toThrow(/Getters not allowed/);
    });

    it("should accept valid plain object", () => {
      const deps = getDependenciesApi(router);

      expect(() => {
        deps.setAll({ foo: 2 });
      }).not.toThrow();
    });
  });

  describe("getDependency validation", () => {
    it("should throw ReferenceError if dependency not found", () => {
      const deps = getDependenciesApi(router);

      expect(() => deps.get("bar" as "foo")).toThrow(ReferenceError);
      expect(() => deps.get("bar" as "foo")).toThrow(/not found/);
    });

    it("should return value when dependency exists", () => {
      const deps = getDependenciesApi(router);

      expect(() => deps.get("foo")).not.toThrow();
      expect(deps.get("foo")).toBe(1);
    });

    it("should throw TypeError if name is not a string", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { get: (k: unknown) => unknown };

      expect(() => raw.get(123)).toThrow(TypeError);
    });
  });

  describe("hasDependency validation", () => {
    it("should throw TypeError for non-string parameters", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { has: (k: unknown) => boolean };

      expect(() => raw.has(123)).toThrow(TypeError);
    });
  });

  describe("removeDependency validation", () => {
    it("should throw TypeError for non-string parameters", () => {
      const deps = getDependenciesApi(router);
      const raw = deps as unknown as { remove: (k: unknown) => void };

      expect(() => {
        raw.remove(null);
      }).toThrow(TypeError);
    });
  });

  describe("resetDependencies integration", () => {
    it("should cause getDependency to throw after reset", () => {
      const deps = getDependenciesApi(router);

      deps.reset();

      expect(() => deps.get("foo")).toThrow(ReferenceError);
    });
  });
});
