import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { logger } from "@real-router/logger";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

let router: Router;

describe("Phase 2 validators — functional integration", () => {
  beforeEach(() => {
    router = createRouter([]);
  });

  afterEach(() => {
    router.stop();
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
    beforeEach(() => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
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

  describe("routes.validateSetRootPathArgs", () => {
    beforeEach(() => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
    });

    it("throws for non-string rootPath", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { setRootPath: (p: unknown) => void };

      expect(() => {
        raw.setRootPath(42);
      }).toThrow(TypeError);
      expect(() => {
        raw.setRootPath(42);
      }).toThrow("rootPath must be a string");
    });

    it("accepts valid string rootPath", () => {
      const api = getPluginApi(router);

      expect(() => {
        api.setRootPath("/api");
      }).not.toThrow();
    });
  });

  describe("routes.guardRouteCallbacks", () => {
    beforeEach(async () => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
      await router.start("/home");
    });

    it("throws when canActivate is not a function", () => {
      const routes = getRoutesApi(router);

      expect(() => {
        routes.add([
          { name: "bad", path: "/bad", canActivate: "not-fn" as never },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        routes.add([
          { name: "bad2", path: "/bad2", canActivate: "not-fn" as never },
        ]);
      }).toThrow("canActivate must be a function");
    });

    it("throws when canDeactivate is not a function", () => {
      const routes = getRoutesApi(router);

      expect(() => {
        routes.add([
          { name: "bad3", path: "/bad3", canDeactivate: 42 as never },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        routes.add([
          { name: "bad4", path: "/bad4", canDeactivate: 42 as never },
        ]);
      }).toThrow("canDeactivate must be a function");
    });
  });

  describe("routes.guardNoAsyncCallbacks", () => {
    beforeEach(async () => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
      await router.start("/home");
    });

    it("throws when decodeParams is async", () => {
      const routes = getRoutesApi(router);

      const asyncFn = async (p: Record<string, unknown>) => p;

      expect(() => {
        routes.add([
          { name: "bad", path: "/bad/:id", decodeParams: asyncFn as never },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        routes.add([
          { name: "bad2", path: "/bad2/:id", decodeParams: asyncFn as never },
        ]);
      }).toThrow("decodeParams cannot be async");
    });

    it("throws when encodeParams is async", () => {
      const routes = getRoutesApi(router);

      const asyncFn = async (p: Record<string, unknown>) => p;

      expect(() => {
        routes.add([
          { name: "bad3", path: "/bad3/:id", encodeParams: asyncFn as never },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        routes.add([
          { name: "bad4", path: "/bad4/:id", encodeParams: asyncFn as never },
        ]);
      }).toThrow("encodeParams cannot be async");
    });

    it("throws when forwardTo callback is async", () => {
      const routes = getRoutesApi(router);

      const asyncForwardTo = async () => "home";

      expect(() => {
        routes.add([
          { name: "fwd", path: "/fwd", forwardTo: asyncForwardTo as never },
        ]);
      }).toThrow(TypeError);
      expect(() => {
        routes.add([
          { name: "fwd2", path: "/fwd2", forwardTo: asyncForwardTo as never },
        ]);
      }).toThrow("forwardTo callback cannot be async");
    });
  });

  describe("plugins.validatePluginKeys", () => {
    beforeEach(() => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());
    });

    it("throws for plugin with unknown property", () => {
      expect(() =>
        router.usePlugin(() => ({ unknownProp: "value" }) as never),
      ).toThrow(TypeError);
      expect(() => router.usePlugin(() => ({ badKey: 42 }) as never)).toThrow(
        "Unknown property",
      );
    });

    it("accepts valid plugin with known keys only", () => {
      expect(() =>
        router.usePlugin(() => ({ onStart: () => {}, teardown: () => {} })),
      ).not.toThrow();
    });
  });

  describe("plugins.warnBatchDuplicates — validationPlugin.ts line 157", () => {
    beforeEach(() => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());
    });

    it("warns when same factory appears multiple times in batch", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const factory = () => ({});

      expect(() => router.usePlugin(factory, factory)).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("Duplicate"),
      );

      vi.restoreAllMocks();
    });
  });

  describe("plugins.warnPluginMethodType", () => {
    beforeEach(() => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());
    });

    it("warns when plugin has event method that is not a function", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      expect(() =>
        router.usePlugin(() => ({ onStart: "not-a-function" }) as never),
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("onStart"),
      );

      vi.restoreAllMocks();
    });
  });

  describe("plugins.warnPluginAfterStart", () => {
    it("warns when registering onStart after router start", async () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        defaultRoute: "home",
      });
      router.usePlugin(validationPlugin());
      await router.start("/home");

      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      expect(() =>
        router.usePlugin(() => ({ onStart: () => {} })),
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("onStart"),
      );

      vi.restoreAllMocks();
    });
  });

  describe("lifecycle.warnOverwrite", () => {
    beforeEach(() => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
    });

    it("warns when adding the same guard twice for the same route", () => {
      const lifecycle = getLifecycleApi(router);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      lifecycle.addActivateGuard("home", true);
      lifecycle.addActivateGuard("home", false);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("home"),
      );

      vi.restoreAllMocks();
    });

    it("warns when overwriting deactivate guard", () => {
      const lifecycle = getLifecycleApi(router);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      lifecycle.addDeactivateGuard("home", true);
      lifecycle.addDeactivateGuard("home", false);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.canDeactivate",
        expect.stringContaining("home"),
      );

      vi.restoreAllMocks();
    });
  });

  describe("lifecycle.warnAsyncGuardSync", () => {
    it("warns when canNavigateTo encounters async guard", async () => {
      router = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "admin", path: "/admin" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(validationPlugin());
      await router.start("/home");

      const lifecycle = getLifecycleApi(router);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      lifecycle.addActivateGuard("admin", () => async () => true);

      router.canNavigateTo("admin");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.canNavigateTo",
        expect.stringContaining("admin"),
      );

      vi.restoreAllMocks();
    });
  });

  describe("options.validateOptions — retrospective call", () => {
    it("does not throw for default router options during registration", () => {
      router = createRouter([{ name: "home", path: "/home" }]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("does not throw for router with custom valid options", () => {
      router = createRouter([{ name: "home", path: "/home" }], {
        trailingSlash: "never",
        queryParamsMode: "strict",
        allowNotFound: false,
      });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });
  });
});
