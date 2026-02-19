import { describe, it, expect } from "vitest";

import { createRouter, events } from "@real-router/core";

import type { Router } from "@real-router/core";

describe("core/limits (integration via public API)", () => {
  // 🔴 CRITICAL: Valid limits flow through createRouter()
  describe("valid limits flow through createRouter()", () => {
    it("should accept valid custom limit without error", () => {
      expect(() => {
        createRouter([], { limits: { maxPlugins: 10 } });
      }).not.toThrowError();
    });

    it("should accept 0 (unlimited) without error", () => {
      expect(() => {
        createRouter([], { limits: { maxPlugins: 0 } });
      }).not.toThrowError();
    });

    it("should accept empty limits object without error", () => {
      expect(() => {
        createRouter([], { limits: {} });
      }).not.toThrowError();
    });

    it("should accept all valid limit keys", () => {
      expect(() => {
        createRouter([], {
          limits: {
            maxPlugins: 10,
            maxMiddleware: 20,
            maxDependencies: 50,
            maxListeners: 30,
            maxEventDepth: 5,
            maxLifecycleHandlers: 100,
          },
        });
      }).not.toThrowError();
    });
  });

  // 🔴 CRITICAL: Invalid limits rejected at construction
  describe("invalid limits rejected at construction", () => {
    it("should throw TypeError for non-integer maxPlugins (string)", () => {
      expect(() => {
        createRouter([], { limits: { maxPlugins: "50" as any } });
      }).toThrowError(TypeError);
      expect(() => {
        createRouter([], { limits: { maxPlugins: "50" as any } });
      }).toThrowError("must be an integer");
    });

    it("should throw TypeError for non-integer maxPlugins (float)", () => {
      expect(() => {
        createRouter([], { limits: { maxPlugins: 1.5 } });
      }).toThrowError(TypeError);
      expect(() => {
        createRouter([], { limits: { maxPlugins: 1.5 } });
      }).toThrowError("must be an integer");
    });

    it("should throw RangeError for negative maxPlugins", () => {
      expect(() => {
        createRouter([], { limits: { maxPlugins: -1 } });
      }).toThrowError(RangeError);
      expect(() => {
        createRouter([], { limits: { maxPlugins: -1 } });
      }).toThrowError("must be between 0 and");
    });

    it("should throw TypeError for unknown limit key", () => {
      expect(() => {
        createRouter([], { limits: { unknownLimit: 50 } as any });
      }).toThrowError(TypeError);
      expect(() => {
        createRouter([], { limits: { unknownLimit: 50 } as any });
      }).toThrowError("unknown limit");
    });

    it("should throw TypeError when limits is null", () => {
      expect(() => {
        createRouter([], { limits: null as any });
      }).toThrowError(TypeError);
      expect(() => {
        createRouter([], { limits: null as any });
      }).toThrowError("expected plain object");
    });

    it("should throw TypeError when limits is array", () => {
      expect(() => {
        createRouter([], { limits: [] as any });
      }).toThrowError(TypeError);
      expect(() => {
        createRouter([], { limits: [] as any });
      }).toThrowError("expected plain object");
    });

    it("should throw TypeError when limits is primitive", () => {
      expect(() => {
        createRouter([], { limits: 123 as any });
      }).toThrowError(TypeError);
    });
  });

  // 🔴 CRITICAL: Custom limits enforced (hard limit — facade validators)
  describe("custom limits enforced", () => {
    it("should enforce custom maxPlugins limit", () => {
      const router = createRouter([], { limits: { maxPlugins: 2 } });

      // Register 2 plugins - should succeed
      expect(() => {
        router.usePlugin(() => ({}));
        router.usePlugin(() => ({}));
      }).not.toThrowError();

      // 3rd plugin should throw
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });

    it("should enforce custom maxMiddleware limit", () => {
      const router = createRouter([], { limits: { maxMiddleware: 1 } });

      // Register 1 middleware - should succeed
      expect(() => {
        router.useMiddleware(() => (_toState, _fromState) => {
          return;
        });
      }).not.toThrowError();

      // 2nd middleware should throw
      expect(() => {
        router.useMiddleware(() => (_toState, _fromState) => {
          return;
        });
      }).toThrowError("Middleware limit exceeded");
    });

    it("should enforce custom maxDependencies limit", () => {
      const router = createRouter<{ dep1?: number; dep2?: number }>([], {
        limits: { maxDependencies: 1 },
      });

      // Set 1 dependency - should succeed
      expect(() => {
        router.setDependency("dep1", 1);
      }).not.toThrowError();

      // 2nd dependency should throw
      expect(() => {
        router.setDependency("dep2", 2);
      }).toThrowError("Dependency limit exceeded");
    });

    it("should enforce custom maxListeners limit", () => {
      const router = createRouter([], { limits: { maxListeners: 1 } });

      // Add 1 listener - should succeed
      expect(() => {
        router.addEventListener(events.ROUTER_START, () => {});
      }).not.toThrowError();

      // 2nd listener should throw
      expect(() => {
        router.addEventListener(events.ROUTER_START, () => {});
      }).toThrowError("Listener limit");
    });
  });

  // 🔴 CRITICAL: 0 = unlimited behavior (hard limit bypassed)
  describe("0 = unlimited behavior", () => {
    it("should allow unlimited plugins when maxPlugins = 0", () => {
      const router = createRouter([], { limits: { maxPlugins: 0 } });

      // Register many plugins - should not throw
      expect(() => {
        for (let i = 0; i < 10; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrowError();
    });

    it("should allow unlimited middleware when maxMiddleware = 0", () => {
      const router = createRouter([], { limits: { maxMiddleware: 0 } });

      // Register many middleware - should not throw
      expect(() => {
        for (let i = 0; i < 10; i++) {
          router.useMiddleware(() => (_toState, _fromState) => {
            return;
          });
        }
      }).not.toThrowError();
    });

    it("should allow unlimited dependencies when maxDependencies = 0", () => {
      const router = createRouter<Record<string, number>>([], {
        limits: { maxDependencies: 0 },
      });

      // Set many dependencies at once via setDependencies - should not throw
      // This covers validateDependencyLimit with maxDependencies === 0
      const manyDeps: Record<string, number> = {};

      for (let i = 0; i < 150; i++) {
        manyDeps[`dep${i}`] = i;
      }

      expect(() => {
        router.setDependencies(manyDeps);
      }).not.toThrowError();

      // Also test setDependency to cover #checkDependencyCount early return
      expect(() => {
        router.setDependency("extraDep", 999);
      }).not.toThrowError();
    });

    it("should allow unlimited listeners when maxListeners = 0", () => {
      const router = createRouter([], { limits: { maxListeners: 0 } });

      // Add many listeners - should not throw
      expect(() => {
        for (let i = 0; i < 10; i++) {
          router.addEventListener(events.ROUTER_START, () => {});
        }
      }).not.toThrowError();
    });

    it("should allow unlimited event depth when maxEventDepth = 0", async () => {
      const router = createRouter([{ name: "home", path: "/" }], {
        limits: { maxEventDepth: 0 },
        defaultRoute: "home",
      });

      // Add listener BEFORE start to ensure event is emitted
      let startEventReceived = false;

      router.addEventListener(events.ROUTER_START, () => {
        startEventReceived = true;
      });

      // Start router - this triggers ROUTER_START event with maxEventDepth=0
      await router.start("/home");

      // Verify event was actually received (confirms event path was executed)
      expect(startEventReceived).toBe(true);
    });

    it("should allow unlimited lifecycle handlers when maxLifecycleHandlers = 0", () => {
      const router = createRouter([], { limits: { maxLifecycleHandlers: 0 } });

      // Register many lifecycle handlers - should not throw
      expect(() => {
        for (let i = 0; i < 10; i++) {
          router.addActivateGuard(`route${i}`, true);
          router.addDeactivateGuard(`route${i}`, true);
        }
      }).not.toThrowError();
    });
  });

  // 🟡 IMPORTANT: Default limits work (regression guard)
  describe("default limits work", () => {
    it("should enforce default maxPlugins limit (50)", () => {
      const router = createRouter([]);

      // Register 50 plugins - should succeed
      expect(() => {
        for (let i = 0; i < 50; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrowError();

      // 51st plugin should throw
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });

    it("should enforce default maxMiddleware limit (50)", () => {
      const router = createRouter([]);

      // Register 50 middleware - should succeed
      expect(() => {
        for (let i = 0; i < 50; i++) {
          router.useMiddleware(() => (_toState, _fromState) => {
            return;
          });
        }
      }).not.toThrowError();

      // 51st middleware should throw
      expect(() => {
        router.useMiddleware(() => (_toState, _fromState) => {
          return;
        });
      }).toThrowError("Middleware limit exceeded");
    });

    it("should enforce default maxDependencies limit (100)", () => {
      const router = createRouter<Record<string, number>>([]);

      // Set 99 dependencies first
      const deps99: Record<string, number> = {};

      for (let i = 0; i < 99; i++) {
        deps99[`dep${i}`] = i;
      }

      expect(() => {
        router.setDependencies(deps99);
      }).not.toThrowError();

      // Adding 2 more via setDependencies should throw (would be 101 total)
      // This tests validateDependencyLimit throw path
      expect(() => {
        router.setDependencies({ dep99: 99, dep100: 100 });
      }).toThrowError("Dependency limit exceeded");
    });

    it("should enforce default maxListeners limit (10000)", () => {
      const router = createRouter([]);

      // Add 10000 listeners - should succeed
      expect(() => {
        for (let i = 0; i < 10_000; i++) {
          router.addEventListener(events.ROUTER_START, () => {});
        }
      }).not.toThrowError();

      // 10001st listener should throw
      expect(() => {
        router.addEventListener(events.ROUTER_START, () => {});
      }).toThrowError("Listener limit");
    });

    it("should work without explicit limits option", () => {
      let router: Router;

      // No limits option - should use defaults
      expect(() => {
        router = createRouter([]);
      }).not.toThrowError();

      // Verify default limits are enforced by registering plugins
      expect(() => {
        for (let i = 0; i < 50; i++) {
          router!.usePlugin(() => ({}));
        }
      }).not.toThrowError();

      // 51st should throw (default limit)
      expect(() => {
        router!.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });
  });

  // 🟡 IMPORTANT: Warn/error threshold logging for dependencies
  describe("dependency thresholds", () => {
    it("should log warning at warn threshold (20% of maxDependencies)", async () => {
      const { logger } = await import("@real-router/logger");
      const { vi } = await import("vitest");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Custom limit of 100 means warn at 20 (Math.floor(100 * 0.2))
      // Check happens BEFORE adding, so we need 20 existing deps to trigger warn
      const router = createRouter<Record<string, number>>([], {
        limits: { maxDependencies: 100 },
      });

      // Set 20 dependencies - no warning yet (count is checked before add)
      for (let i = 0; i < 20; i++) {
        router.setDependency(`dep${i}`, i);
      }

      expect(warnSpy).not.toHaveBeenCalled();

      // 21st dependency should trigger warning (count === 20 at check time)
      router.setDependency("dep20", 20);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.setDependency",
        expect.stringContaining("20 dependencies"),
      );

      warnSpy.mockRestore();
    });

    it("should log error at error threshold (50% of maxDependencies)", async () => {
      const { logger } = await import("@real-router/logger");
      const { vi } = await import("vitest");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      // Custom limit of 100 means error at 50
      // Check happens BEFORE adding, so we need 50 existing deps to trigger error
      const router = createRouter<Record<string, number>>([], {
        limits: { maxDependencies: 100 },
      });

      // Set 50 dependencies - no error yet (count is checked before add)
      for (let i = 0; i < 50; i++) {
        router.setDependency(`dep${i}`, i);
      }

      expect(errorSpy).not.toHaveBeenCalled();

      // 51st dependency should trigger error log (count === 50 at check time)
      router.setDependency("dep50", 50);

      expect(errorSpy).toHaveBeenCalledWith(
        "router.setDependency",
        expect.stringContaining("50 dependencies"),
      );

      errorSpy.mockRestore();
    });
  });

  // 🟡 IMPORTANT: Warn/error threshold logging for lifecycle handlers
  describe("lifecycle handler thresholds", () => {
    it("should enforce default maxLifecycleHandlers limit (200)", () => {
      const router = createRouter([]);

      // Register 199 canActivate handlers - should succeed
      expect(() => {
        for (let i = 0; i < 199; i++) {
          router.addActivateGuard(`route${i}`, true);
        }
      }).not.toThrowError();

      // 200th handler should throw
      expect(() => {
        router.addActivateGuard("route199", true);
      }).toThrowError(/limit exceeded.*200/i);
    });

    it("should log warning at warn threshold (20% of maxLifecycleHandlers)", async () => {
      const { logger } = await import("@real-router/logger");
      const { vi } = await import("vitest");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Custom limit of 100 means warn at 20 (Math.floor(100 * 0.2))
      const router = createRouter([], {
        limits: { maxLifecycleHandlers: 100 },
      });

      // Register 19 handlers - no warning
      for (let i = 0; i < 19; i++) {
        router.addActivateGuard(`route${i}`, true);
      }

      expect(warnSpy).not.toHaveBeenCalled();

      // 20th handler should trigger warning
      router.addActivateGuard("route19", true);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("20 lifecycle handlers"),
      );

      warnSpy.mockRestore();
    });

    it("should log error at error threshold (50% of maxLifecycleHandlers)", async () => {
      const { logger } = await import("@real-router/logger");
      const { vi } = await import("vitest");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      // Custom limit of 100 means error at 50
      const router = createRouter([], {
        limits: { maxLifecycleHandlers: 100 },
      });

      // Register 49 handlers - no error
      for (let i = 0; i < 49; i++) {
        router.addActivateGuard(`route${i}`, true);
      }

      expect(errorSpy).not.toHaveBeenCalled();

      // 50th handler should trigger error log
      router.addActivateGuard("route49", true);

      expect(errorSpy).toHaveBeenCalledWith(
        "router.canActivate",
        expect.stringContaining("50 lifecycle handlers"),
      );

      errorSpy.mockRestore();
    });
  });

  // 🟢 DESIRABLE: Edge cases and combinations
  describe("edge cases and combinations", () => {
    it("should handle mixed custom and default limits", () => {
      const router = createRouter([], {
        limits: {
          maxPlugins: 5, // Custom
          // maxMiddleware uses default (50)
        },
      });

      // Custom limit enforced
      expect(() => {
        for (let i = 0; i < 5; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrowError();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");

      // Default limit still enforced for middleware
      expect(() => {
        for (let i = 0; i < 50; i++) {
          router.useMiddleware(() => (_toState, _fromState) => {
            return;
          });
        }
      }).not.toThrowError();

      expect(() => {
        router.useMiddleware(() => (_toState, _fromState) => {
          return;
        });
      }).toThrowError("Middleware limit exceeded");
    });

    it("should handle limit of 1 (minimum non-zero)", () => {
      const router = createRouter([], { limits: { maxPlugins: 1 } });

      // 1 plugin should succeed
      expect(() => {
        router.usePlugin(() => ({}));
      }).not.toThrowError();

      // 2nd should throw
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });

    it("should handle very large custom limits", () => {
      const router = createRouter([], { limits: { maxPlugins: 1000 } });

      // Should accept large limit without error
      expect(() => {
        for (let i = 0; i < 100; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrowError();
    });

    it("should preserve limits in cloned router", () => {
      const router = createRouter([], { limits: { maxPlugins: 3 } });

      const cloned = router.clone();

      // Cloned router should have same limits
      expect(() => {
        cloned.usePlugin(() => ({}));
        cloned.usePlugin(() => ({}));
        cloned.usePlugin(() => ({}));
      }).not.toThrowError();

      expect(() => {
        cloned.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });

    it("should handle all limits set to 0 (unlimited everything)", () => {
      const router = createRouter([], {
        limits: {
          maxPlugins: 0,
          maxMiddleware: 0,
          maxDependencies: 0,
          maxListeners: 0,
          maxEventDepth: 0,
          maxLifecycleHandlers: 0,
        },
      });

      // All operations should succeed without limits
      expect(() => {
        for (let i = 0; i < 20; i++) {
          router.usePlugin(() => ({}));
          router.useMiddleware(() => (_toState, _fromState) => {
            return;
          });
        }
      }).not.toThrowError();
    });

    it("should skip undefined limit values in config", () => {
      // undefined values should be ignored, not cause errors
      expect(() => {
        createRouter([], {
          limits: {
            maxPlugins: undefined,
            maxMiddleware: 50,
          } as any,
        });
      }).not.toThrowError();

      // maxPlugins should use default (50) when undefined
      const router = createRouter([], {
        limits: {
          maxPlugins: undefined,
        } as any,
      });

      // Register 50 plugins (default limit)
      expect(() => {
        for (let i = 0; i < 50; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrowError();

      // 51st should throw (default limit)
      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrowError("Plugin limit exceeded");
    });

    it("should accept limits: undefined (skip validation)", () => {
      // When limits option is explicitly undefined, validateLimits is not called
      expect(() => {
        createRouter([], {
          limits: undefined,
        } as any);
      }).not.toThrowError();
    });

    it("should accept logger option without error", () => {
      // logger is an optional field not in defaultOptions
      expect(() => {
        createRouter([], {
          logger: { level: "all" },
        } as any);
      }).not.toThrowError();
    });
  });
});
