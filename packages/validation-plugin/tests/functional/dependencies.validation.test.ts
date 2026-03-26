import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";
import { logger } from "@real-router/logger";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

describe("dependencies.validateDependencyCount — threshold logging", () => {
  it("logs warn at 20% threshold when adding a new dependency", () => {
    type NumDeps = Record<string, number>;
    const r = createRouter<NumDeps>([], { limits: { maxDependencies: 100 } });

    r.usePlugin(validationPlugin());
    const deps = getDependenciesApi(r);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    for (let i = 0; i < 20; i++) {
      deps.set(`dep${i}`, i);
    }

    expect(warnSpy).not.toHaveBeenCalledWith(
      "router.setDependency",
      expect.stringContaining("dependencies"),
    );

    deps.set("dep20", 20);

    expect(warnSpy).toHaveBeenCalledWith(
      "router.setDependency",
      expect.stringContaining("20 dependencies"),
    );

    r.stop();
    vi.restoreAllMocks();
  });
});

describe("dependencies.validateCloneArgs", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
  });

  it("throws for null dependencies in cloneRouter", () => {
    expect(() => cloneRouter(router, null as never)).toThrow(TypeError);
    expect(() => cloneRouter(router, null as never)).toThrow(
      "expected plain object or undefined",
    );
  });

  it("throws for array dependencies in cloneRouter", () => {
    expect(() => cloneRouter(router, [] as never)).toThrow(TypeError);
  });

  it("throws for getter dependencies in cloneRouter", () => {
    const objWithGetter = {} as Record<string, unknown>;

    Object.defineProperty(objWithGetter, "key", {
      get: () => "value",
      enumerable: true,
    });

    expect(() => cloneRouter(router, objWithGetter as never)).toThrow(
      TypeError,
    );
    expect(() => cloneRouter(router, objWithGetter as never)).toThrow(
      "Getters not allowed",
    );
  });

  it("accepts valid plain object dependencies in cloneRouter", () => {
    expect(() => cloneRouter(router, {})).not.toThrow();
  });
});

describe("dependencies.warnRemoveNonExistent", () => {
  it("warns when removing a non-existent dependency", () => {
    interface TestDeps {
      foo?: number;
      bar?: number;
    }
    const r = createRouter<TestDeps>([], {}, { foo: 1 });

    r.usePlugin(validationPlugin());
    const deps = getDependenciesApi(r);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.remove("bar");

    expect(warnSpy).toHaveBeenCalledWith(
      "router.removeDependency",
      expect.stringContaining("bar"),
    );

    r.stop();
    vi.restoreAllMocks();
  });
});
