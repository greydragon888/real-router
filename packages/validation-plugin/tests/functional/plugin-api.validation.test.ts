import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { logger } from "@real-router/logger";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createValidationRouter } from "../helpers";
import { validationPlugin } from "@real-router/validation-plugin";

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
        makeState: (
          n: unknown,
          p?: unknown,
          path?: unknown,
          m?: unknown,
          id?: unknown,
        ) => unknown;
      };

      expect(() => raw.makeState(123)).toThrow(TypeError);
      expect(() => raw.makeState(null)).toThrow(TypeError);
    });

    it("throws TypeError for invalid params", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.makeState("home", "string-params")).toThrow(TypeError);
      expect(() => raw.makeState("home", [])).toThrow(TypeError);
    });

    it("throws TypeError for non-string path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState: (n: unknown, p?: unknown, path?: unknown) => unknown;
      };

      expect(() => raw.makeState("home", {}, 123)).toThrow(TypeError);
    });

    it("throws TypeError for non-number forceId", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        makeState: (
          n: unknown,
          p?: unknown,
          path?: unknown,
          m?: unknown,
          id?: unknown,
        ) => unknown;
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
        buildState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.buildState(123)).toThrow(TypeError);
      expect(() => raw.buildState(null)).toThrow(TypeError);
    });

    it("throws TypeError for invalid routeParams", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildState: (n: unknown, p?: unknown) => unknown;
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
        forwardState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.forwardState(123)).toThrow(TypeError);
    });

    it("throws TypeError for invalid routeParams", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        forwardState: (n: unknown, p?: unknown) => unknown;
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
        areStatesEqual: (s1: unknown, s2: unknown) => boolean;
      };

      expect(() => raw.areStatesEqual("not-state", {})).toThrow(TypeError);
    });

    it("throws TypeError for invalid state2", () => {
      const validState = router.getState()!;
      const raw = router as unknown as {
        areStatesEqual: (s1: unknown, s2: unknown) => boolean;
      };

      expect(() => raw.areStatesEqual(validState, "not-state")).toThrow(
        TypeError,
      );
    });

    it("throws TypeError for invalid ignoreQueryParams", () => {
      const validState = router.getState()!;
      const raw = router as unknown as {
        areStatesEqual: (s1: unknown, s2: unknown, iqp?: unknown) => boolean;
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
        buildNavigationState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.buildNavigationState(123)).toThrow(TypeError);
      expect(() => raw.buildNavigationState(null)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid routeParams (string)", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.buildNavigationState("home", "string")).toThrow(
        TypeError,
      );
    });

    it("should throw TypeError for invalid routeParams (function)", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.buildNavigationState("home", () => {})).toThrow(
        TypeError,
      );
    });

    it("should include 'buildNavigationState' in error message", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        buildNavigationState: (n: unknown, p?: unknown) => unknown;
      };

      expect(() => raw.buildNavigationState(123)).toThrow(
        /buildNavigationState/,
      );
    });
  });
});

describe("validateAddInterceptorArgs — addInterceptor() validation", () => {
  let router: Router;

  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("throws TypeError for unknown method name", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("unknown", () => {})).toThrow(TypeError);
  });

  it("throws TypeError for non-string method", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor(123, () => {})).toThrow(TypeError);
  });

  it("throws TypeError for null method", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor(null, () => {})).toThrow(TypeError);
  });

  it("includes invalid method name in error message", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("navigate", () => {})).toThrow(
      /"navigate"/,
    );
  });

  it("includes valid method names in error message", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("navigate", () => {})).toThrow(
      /start, buildPath, forwardState/,
    );
  });

  it("throws TypeError when fn is not a function (string)", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("start", "not-a-function")).toThrow(
      TypeError,
    );
  });

  it("throws TypeError when fn is not a function (number)", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("start", 42)).toThrow(TypeError);
  });

  it("throws TypeError when fn is null", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("start", null)).toThrow(TypeError);
  });

  it("includes 'interceptor must be a function' in message", () => {
    const api = getPluginApi(router);
    const raw = api as unknown as {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    };

    expect(() => raw.addInterceptor("start", "bad")).toThrow(
      /interceptor must be a function/,
    );
  });

  it("accepts 'start' with a valid function", () => {
    const api = getPluginApi(router);

    expect(() =>
      api.addInterceptor("start", (next, path) => next(path)),
    ).not.toThrow();
  });

  it("accepts 'buildPath' with a valid function", () => {
    const api = getPluginApi(router);

    expect(() =>
      api.addInterceptor("buildPath", (next, name, params) =>
        next(name, params),
      ),
    ).not.toThrow();
  });

  it("accepts 'forwardState' with a valid function", () => {
    const api = getPluginApi(router);

    expect(() =>
      api.addInterceptor("forwardState", (next, name, params) =>
        next(name, params),
      ),
    ).not.toThrow();
  });
});

describe("plugins.validatePluginKeys", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
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
  let router: Router;

  beforeEach(() => {
    router = createRouter([]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
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
  let router: Router;

  beforeEach(() => {
    router = createRouter([]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
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
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  it("warns when registering onStart after router start", async () => {
    router = createRouter([{ name: "home", path: "/home" }], {
      defaultRoute: "home",
    });
    router.usePlugin(validationPlugin());
    await router.start("/home");

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(() => router.usePlugin(() => ({ onStart: () => {} }))).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      "router.usePlugin",
      expect.stringContaining("onStart"),
    );

    vi.restoreAllMocks();
  });
});
