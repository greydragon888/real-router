import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { logger } from "@real-router/logger";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

let router: Router;

describe("lifecycle validation — with validationPlugin", () => {
  beforeEach(() => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
  });

  describe("addActivateGuard validation", () => {
    it("should throw TypeError for null route name", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard(null, true)).toThrow(TypeError);
    });

    it("should throw TypeError for undefined route name", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard(undefined, true)).toThrow(TypeError);
    });

    it("should throw TypeError for non-string route name types", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard(123, true)).toThrow(TypeError);
      expect(() => raw.addActivateGuard({}, true)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid route names (Cyrillic)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("путь", true)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid route names (emoji)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("🏠", true)).toThrow(TypeError);
    });

    it("should include descriptive error message for invalid handler", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("home", 123)).toThrow(TypeError);
      expect(() => raw.addActivateGuard("home", 123)).toThrow(/Handler must/);
    });

    it("should throw TypeError for invalid handlers (number)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("home", 42)).toThrow(TypeError);
    });

    it("should throw TypeError for Boolean Object (boxed)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("home", new Object(true))).toThrow(
        TypeError,
      );
    });

    it("should accept valid boolean handler", () => {
      const lifecycle = getLifecycleApi(router);

      expect(() => {
        lifecycle.addActivateGuard("home", true);
      }).not.toThrow();
    });

    it("should accept valid function handler", () => {
      const lifecycle = getLifecycleApi(router);

      expect(() => {
        lifecycle.addActivateGuard("home", () => () => true);
      }).not.toThrow();
    });

    it("should handle very long route names correctly", () => {
      const lifecycle = getLifecycleApi(router);
      const veryLongName = "a".repeat(10_001);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard(veryLongName, true)).toThrow();
    });

    it("should reject String Object (only primitive strings allowed)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard(new Object("home"), true)).toThrow(
        TypeError,
      );
    });

    it("should reject route names with null bytes (security)", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addActivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addActivateGuard("home\u0000", true)).toThrow(TypeError);
    });
  });

  describe("addDeactivateGuard validation", () => {
    it("should throw TypeError for invalid route names", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addDeactivateGuard: (n: unknown, h: unknown) => unknown;
      };

      expect(() => raw.addDeactivateGuard(null, true)).toThrow(TypeError);
      expect(() => raw.addDeactivateGuard(123, true)).toThrow(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        addDeactivateGuard: (n: unknown, h: unknown) => unknown;
      };
      const veryLongName = "a".repeat(10_001);

      expect(() => raw.addDeactivateGuard(veryLongName, true)).toThrow();
    });
  });

  describe("removeActivateGuard / removeDeactivateGuard validation", () => {
    it("should throw TypeError for invalid route name in removeActivateGuard", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        removeActivateGuard: (n: unknown) => unknown;
      };

      expect(() => raw.removeActivateGuard(null)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid route name in removeDeactivateGuard", () => {
      const lifecycle = getLifecycleApi(router);
      const raw = lifecycle as unknown as {
        removeDeactivateGuard: (n: unknown) => unknown;
      };

      expect(() => raw.removeDeactivateGuard(null)).toThrow(TypeError);
    });
  });

  describe("lifecycle handler limit enforcement", () => {
    it("should throw when maxLifecycleHandlers limit exceeded", () => {
      const r = createRouter([], { limits: { maxLifecycleHandlers: 5 } });

      r.usePlugin(validationPlugin());
      const lifecycle = getLifecycleApi(r);

      expect(() => {
        for (let i = 0; i < 5; i++) {
          lifecycle.addActivateGuard(`route${i}`, true);
        }
      }).not.toThrow();

      expect(() => {
        lifecycle.addActivateGuard("route5", true);
      }).toThrow(/limit exceeded/);
    });
  });
});

describe("lifecycle.warnOverwrite", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter([{ name: "home", path: "/home" }]);
    router.usePlugin(validationPlugin());
  });

  afterEach(() => {
    router.stop();
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
  let router: Router;

  afterEach(() => {
    router.stop();
  });

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
