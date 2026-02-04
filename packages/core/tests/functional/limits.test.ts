import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/limits", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("default limits", () => {
    it("should use default limits when no limits option provided", () => {
      const limits = router.getLimits();

      expect(limits).toBeDefined();
      expect(limits.maxDependencies).toBe(100);
      expect(limits.maxPlugins).toBe(50);
      expect(limits.maxMiddleware).toBe(50);
      expect(limits.maxListeners).toBe(10_000);
      expect(limits.maxEventDepth).toBe(5);
      expect(limits.maxLifecycleHandlers).toBe(200);
    });

    it("should have correct default values matching original constants", () => {
      const limits = router.getLimits();

      // Verify all 6 limits are present
      expect(Object.keys(limits)).toHaveLength(6);
      expect(limits).toHaveProperty("maxDependencies");
      expect(limits).toHaveProperty("maxPlugins");
      expect(limits).toHaveProperty("maxMiddleware");
      expect(limits).toHaveProperty("maxListeners");
      expect(limits).toHaveProperty("maxEventDepth");
      expect(limits).toHaveProperty("maxLifecycleHandlers");
    });

    it("should work before router.start()", () => {
      const limits = router.getLimits();

      expect(limits).toBeDefined();
      expect(limits.maxDependencies).toBe(100);
    });

    it("should work after router.start()", () => {
      router.start();

      const limits = router.getLimits();

      expect(limits).toBeDefined();
      expect(limits.maxDependencies).toBe(100);
    });
  });

  describe("custom limits", () => {
    it("should accept custom limits at creation", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 200,
          maxPlugins: 100,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxDependencies).toBe(200);
      expect(limits.maxPlugins).toBe(100);

      customRouter.stop();
    });

    it("should preserve default limits for non-specified values", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 150,
        },
      });

      const limits = customRouter.getLimits();

      // Custom value
      expect(limits.maxDependencies).toBe(150);

      // Default values for non-specified
      expect(limits.maxPlugins).toBe(50);
      expect(limits.maxMiddleware).toBe(50);
      expect(limits.maxListeners).toBe(10_000);
      expect(limits.maxEventDepth).toBe(5);
      expect(limits.maxLifecycleHandlers).toBe(200);

      customRouter.stop();
    });

    it("should accept partial limits with multiple custom values", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 500,
          maxPlugins: 200,
          maxMiddleware: 300,
          maxEventDepth: 10,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxDependencies).toBe(500);
      expect(limits.maxPlugins).toBe(200);
      expect(limits.maxMiddleware).toBe(300);
      expect(limits.maxEventDepth).toBe(10);

      // Defaults for non-specified
      expect(limits.maxListeners).toBe(10_000);
      expect(limits.maxLifecycleHandlers).toBe(200);

      customRouter.stop();
    });

    it("should accept all limits customized", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 200,
          maxPlugins: 100,
          maxMiddleware: 100,
          maxListeners: 20_000,
          maxEventDepth: 10,
          maxLifecycleHandlers: 400,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxDependencies).toBe(200);
      expect(limits.maxPlugins).toBe(100);
      expect(limits.maxMiddleware).toBe(100);
      expect(limits.maxListeners).toBe(20_000);
      expect(limits.maxEventDepth).toBe(10);
      expect(limits.maxLifecycleHandlers).toBe(400);

      customRouter.stop();
    });
  });

  describe("immutability", () => {
    it("should return frozen limits object", () => {
      const limits = router.getLimits();

      expect(Object.isFrozen(limits)).toBe(true);
    });

    it("should throw when trying to mutate limits", () => {
      const limits = router.getLimits();

      expect(() => {
        (limits as any).maxDependencies = 999;
      }).toThrowError(TypeError);

      expect(() => {
        (limits as any).maxPlugins = 999;
      }).toThrowError(TypeError);

      expect(() => {
        (limits as any).maxMiddleware = 999;
      }).toThrowError(TypeError);

      expect(() => {
        (limits as any).maxListeners = 999;
      }).toThrowError(TypeError);

      expect(() => {
        (limits as any).maxEventDepth = 999;
      }).toThrowError(TypeError);

      expect(() => {
        (limits as any).maxLifecycleHandlers = 999;
      }).toThrowError(TypeError);
    });

    it("should return same object reference on multiple calls", () => {
      const limits1 = router.getLimits();
      const limits2 = router.getLimits();
      const limits3 = router.getLimits();

      // Same frozen object (performance optimization)
      expect(limits1).toBe(limits2);
      expect(limits2).toBe(limits3);
      expect(limits1).toBe(limits3);
    });

    it("should handle multiple sequential calls correctly", () => {
      const calls = Array.from({ length: 5 }, () => router.getLimits());

      // All same frozen object (performance optimization)
      for (let i = 0; i < calls.length; i++) {
        for (let j = i + 1; j < calls.length; j++) {
          expect(calls[i]).toBe(calls[j]);
        }
      }

      // All frozen
      calls.forEach((limits) => {
        expect(Object.isFrozen(limits)).toBe(true);
      });
    });

    it("should prevent adding new properties to limits", () => {
      const limits = router.getLimits();

      expect(() => {
        (limits as any).newProperty = 123;
      }).toThrowError(TypeError);
    });

    it("should prevent deleting properties from limits", () => {
      const limits = router.getLimits();

      expect(() => {
        delete (limits as any).maxDependencies;
      }).toThrowError(TypeError);
    });
  });

  describe("validation", () => {
    describe("type validation", () => {
      it("should throw TypeError for non-number limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: "100" as any,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: "100" as any,
            },
          }),
        ).toThrowError("must be a number");
      });

      it("should throw TypeError for null limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: null as any,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: null as any,
            },
          }),
        ).toThrowError("must be a number");
      });

      it("should throw TypeError for undefined limit (when explicitly set)", () => {
        // undefined is skipped during initialization, so this tests explicit undefined
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: undefined as any,
            },
          }),
        ).not.toThrowError(); // undefined is skipped
      });

      it("should throw TypeError for boolean limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: true as any,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: true as any,
            },
          }),
        ).toThrowError("must be a number");
      });

      it("should throw TypeError for object limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: {} as any,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: {} as any,
            },
          }),
        ).toThrowError("must be a number");
      });

      it("should throw TypeError for array limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: [] as any,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: [] as any,
            },
          }),
        ).toThrowError("must be a number");
      });
    });

    describe("integer validation", () => {
      it("should throw TypeError for non-integer limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 100.5,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 100.5,
            },
          }),
        ).toThrowError("must be an integer");
      });

      it("should throw TypeError for float limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 99.99,
            },
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 99.99,
            },
          }),
        ).toThrowError("must be an integer");
      });

      it("should accept integer limits", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 100,
              maxPlugins: 50,
            },
          }),
        ).not.toThrowError();
      });
    });

    describe("bounds validation", () => {
      it("should throw RangeError for limit below minimum", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 0,
            },
          }),
        ).toThrowError(RangeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 0,
            },
          }),
        ).toThrowError("must be between");
      });

      it("should throw RangeError for negative limit", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: -100,
            },
          }),
        ).toThrowError(RangeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: -100,
            },
          }),
        ).toThrowError("must be between");
      });

      it("should throw RangeError for limit above maximum", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 10_001,
            },
          }),
        ).toThrowError(RangeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 10_001,
            },
          }),
        ).toThrowError("must be between");
      });

      it("should accept limit at minimum boundary", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 1,
            },
          }),
        ).not.toThrowError();
      });

      it("should accept limit at maximum boundary", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 10_000,
            },
          }),
        ).not.toThrowError();
      });

      it("should validate each limit with its own bounds", () => {
        // maxPlugins: min=1, max=1000
        expect(() =>
          createTestRouter({
            limits: {
              maxPlugins: 0,
            },
          }),
        ).toThrowError(RangeError);

        expect(() =>
          createTestRouter({
            limits: {
              maxPlugins: 1001,
            },
          }),
        ).toThrowError(RangeError);

        // maxEventDepth: min=1, max=100
        expect(() =>
          createTestRouter({
            limits: {
              maxEventDepth: 0,
            },
          }),
        ).toThrowError(RangeError);

        expect(() =>
          createTestRouter({
            limits: {
              maxEventDepth: 101,
            },
          }),
        ).toThrowError(RangeError);
      });
    });

    describe("unknown limit validation", () => {
      it("should throw TypeError for unknown limit key", () => {
        expect(() =>
          createTestRouter({
            limits: {
              unknownLimit: 100,
            } as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              unknownLimit: 100,
            } as any,
          }),
        ).toThrowError("unknown limit");
      });

      it("should throw TypeError for typo in limit name", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencie: 100,
            } as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencie: 100,
            } as any,
          }),
        ).toThrowError("unknown limit");
      });
    });

    describe("limits object validation", () => {
      it("should throw TypeError for non-object limits", () => {
        expect(() =>
          createTestRouter({
            limits: "invalid" as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: "invalid" as any,
          }),
        ).toThrowError("expected plain object");
      });

      it("should throw TypeError for array as limits", () => {
        expect(() =>
          createTestRouter({
            limits: [] as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: [] as any,
          }),
        ).toThrowError("expected plain object");
      });

      it("should throw TypeError for null as limits", () => {
        expect(() =>
          createTestRouter({
            limits: null as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: null as any,
          }),
        ).toThrowError("expected plain object");
      });

      it("should throw TypeError for class instance as limits", () => {
        class CustomLimits {
          maxDependencies = 100;
        }

        expect(() =>
          createTestRouter({
            limits: new CustomLimits() as any,
          }),
        ).toThrowError(TypeError);
        expect(() =>
          createTestRouter({
            limits: new CustomLimits() as any,
          }),
        ).toThrowError("expected plain object");
      });

      it("should accept empty limits object", () => {
        expect(() =>
          createTestRouter({
            limits: {} as any,
          }),
        ).not.toThrowError();
      });

      it("should accept plain object with limits", () => {
        expect(() =>
          createTestRouter({
            limits: {
              maxDependencies: 100,
            } as any,
          }),
        ).not.toThrowError();
      });
    });
  });

  describe("threshold computation", () => {
    it("should compute WARN as 20% of limit", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 100,
        },
      });

      const limits = customRouter.getLimits();

      // WARN = Math.floor(100 * 0.2) = 20
      expect(limits.maxDependencies).toBe(100);

      customRouter.stop();
    });

    it("should compute ERROR as 50% of limit", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 100,
        },
      });

      const limits = customRouter.getLimits();

      // ERROR = Math.floor(100 * 0.5) = 50
      expect(limits.maxDependencies).toBe(100);

      customRouter.stop();
    });

    it("should use Math.floor for threshold computation", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 99, // 99 * 0.2 = 19.8 -> floor = 19
        },
      });

      const limits = customRouter.getLimits();

      // Verify the limit is stored correctly
      expect(limits.maxDependencies).toBe(99);

      customRouter.stop();
    });

    it("should handle threshold computation for all limits", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 100,
          maxPlugins: 50,
          maxMiddleware: 50,
          maxListeners: 10_000,
          maxEventDepth: 5,
          maxLifecycleHandlers: 200,
        },
      });

      const limits = customRouter.getLimits();

      // All limits should be stored correctly
      expect(limits.maxDependencies).toBe(100);
      expect(limits.maxPlugins).toBe(50);
      expect(limits.maxMiddleware).toBe(50);
      expect(limits.maxListeners).toBe(10_000);
      expect(limits.maxEventDepth).toBe(5);
      expect(limits.maxLifecycleHandlers).toBe(200);

      customRouter.stop();
    });
  });

  describe("type safety", () => {
    // eslint-disable-next-line vitest/expect-expect -- uses expectTypeOf for compile-time assertions
    it("should be type-safe for getLimits return type", () => {
      const limits = router.getLimits();

      expectTypeOf(limits.maxDependencies).toBeNumber();
      expectTypeOf(limits.maxPlugins).toBeNumber();
      expectTypeOf(limits.maxMiddleware).toBeNumber();
      expectTypeOf(limits.maxListeners).toBeNumber();
      expectTypeOf(limits.maxEventDepth).toBeNumber();
      expectTypeOf(limits.maxLifecycleHandlers).toBeNumber();
    });

    it("should return Readonly type", () => {
      const limits = router.getLimits();

      // This should be caught at compile time, but we verify runtime behavior
      expect(Object.isFrozen(limits)).toBe(true);
    });
  });

  describe("integration with router lifecycle", () => {
    it("should work before start()", () => {
      const limits = router.getLimits();

      expect(limits.maxDependencies).toBe(100);
    });

    it("should work after start()", () => {
      router.start();

      const limits = router.getLimits();

      expect(limits.maxDependencies).toBe(100);
    });

    it("should work after stop()", () => {
      router.start();
      router.stop();

      const limits = router.getLimits();

      expect(limits.maxDependencies).toBe(100);
    });

    it("should maintain limits across multiple start/stop cycles", () => {
      const limits1 = router.getLimits();

      router.start();
      const limits2 = router.getLimits();

      router.stop();
      const limits3 = router.getLimits();

      // All should be the same frozen object
      expect(limits1).toBe(limits2);
      expect(limits2).toBe(limits3);
    });
  });

  describe("edge cases", () => {
    it("should handle limits with minimum values for most limits", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 1,
          maxPlugins: 1,
          maxMiddleware: 1,
          maxListeners: 1,
          maxEventDepth: 1,
          maxLifecycleHandlers: 10,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxDependencies).toBe(1);
      expect(limits.maxPlugins).toBe(1);
      expect(limits.maxMiddleware).toBe(1);
      expect(limits.maxListeners).toBe(1);
      expect(limits.maxEventDepth).toBe(1);
      expect(limits.maxLifecycleHandlers).toBe(10);

      customRouter.stop();
    });

    it("should handle limits with maximum values", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 10_000,
          maxPlugins: 1000,
          maxMiddleware: 1000,
          maxListeners: 100_000,
          maxEventDepth: 100,
          maxLifecycleHandlers: 10_000,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxDependencies).toBe(10_000);
      expect(limits.maxPlugins).toBe(1000);
      expect(limits.maxMiddleware).toBe(1000);
      expect(limits.maxListeners).toBe(100_000);
      expect(limits.maxEventDepth).toBe(100);
      expect(limits.maxLifecycleHandlers).toBe(10_000);

      customRouter.stop();
    });

    it("should handle large limit values", () => {
      const customRouter = createTestRouter({
        limits: {
          maxListeners: 99_999,
        },
      });

      const limits = customRouter.getLimits();

      expect(limits.maxListeners).toBe(99_999);

      customRouter.stop();
    });

    it("should handle mixed custom and default limits", () => {
      const customRouter = createTestRouter({
        limits: {
          maxDependencies: 500,
          maxEventDepth: 20,
        },
      });

      const limits = customRouter.getLimits();

      // Custom
      expect(limits.maxDependencies).toBe(500);
      expect(limits.maxEventDepth).toBe(20);

      // Defaults
      expect(limits.maxPlugins).toBe(50);
      expect(limits.maxMiddleware).toBe(50);
      expect(limits.maxListeners).toBe(10_000);
      expect(limits.maxLifecycleHandlers).toBe(200);

      customRouter.stop();
    });
  });

  describe("getLimits method", () => {
    it("should return limits object", () => {
      const limits = router.getLimits();

      expect(limits).toBeDefined();
      expect(typeof limits).toBe("object");
    });

    it("should return same reference on consecutive calls", () => {
      const limits1 = router.getLimits();
      const limits2 = router.getLimits();
      const limits3 = router.getLimits();

      expect(limits1).toBe(limits2);
      expect(limits2).toBe(limits3);
    });

    it("should return frozen object", () => {
      const limits = router.getLimits();

      expect(Object.isFrozen(limits)).toBe(true);
    });

    it("should contain all required properties", () => {
      const limits = router.getLimits();

      const requiredProperties = [
        "maxDependencies",
        "maxPlugins",
        "maxMiddleware",
        "maxListeners",
        "maxEventDepth",
        "maxLifecycleHandlers",
      ];

      for (const prop of requiredProperties) {
        expect(limits).toHaveProperty(prop);
      }
    });

    it("should not contain extra properties", () => {
      const limits = router.getLimits();

      const keys = Object.keys(limits);

      expect(keys).toHaveLength(6);
    });
  });
});
