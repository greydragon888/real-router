import { describe, it, expect } from "vitest";

import { LimitsNamespace } from "../../../src/namespaces/LimitsNamespace";
import {
  DEFAULT_LIMITS,
  LIMIT_BOUNDS,
} from "../../../src/namespaces/LimitsNamespace/constants";
import { computeThresholds } from "../../../src/namespaces/LimitsNamespace/helpers";

describe("LimitsNamespace", () => {
  describe("constructor", () => {
    it("should use default limits when no initial limits provided", () => {
      const limits = new LimitsNamespace();

      expect(limits.get()).toStrictEqual(DEFAULT_LIMITS);
    });

    it("should use default limits when empty object provided", () => {
      const limits = new LimitsNamespace({});

      expect(limits.get()).toStrictEqual(DEFAULT_LIMITS);
    });

    it("should accept custom limits at creation", () => {
      const limits = new LimitsNamespace({
        maxPlugins: 100,
        maxMiddleware: 75,
      });

      const config = limits.get();

      expect(config.maxPlugins).toBe(100);
      expect(config.maxMiddleware).toBe(75);
    });

    it("should preserve default limits for non-specified values", () => {
      const limits = new LimitsNamespace({
        maxPlugins: 100,
      });

      const config = limits.get();

      // Custom value
      expect(config.maxPlugins).toBe(100);

      // Default values preserved
      expect(config.maxDependencies).toBe(DEFAULT_LIMITS.maxDependencies);
      expect(config.maxMiddleware).toBe(DEFAULT_LIMITS.maxMiddleware);
      expect(config.maxListeners).toBe(DEFAULT_LIMITS.maxListeners);
      expect(config.maxEventDepth).toBe(DEFAULT_LIMITS.maxEventDepth);
      expect(config.maxLifecycleHandlers).toBe(
        DEFAULT_LIMITS.maxLifecycleHandlers,
      );
    });

    it("should accept all custom limits", () => {
      const customLimits = {
        maxDependencies: 150,
        maxPlugins: 75,
        maxMiddleware: 60,
        maxListeners: 15_000,
        maxEventDepth: 10,
        maxLifecycleHandlers: 300,
      };

      const limits = new LimitsNamespace(customLimits);

      expect(limits.get()).toStrictEqual(customLimits);
    });
  });

  describe("get", () => {
    it("should return frozen limits object", () => {
      const limits = new LimitsNamespace();
      const config = limits.get();

      expect(Object.isFrozen(config)).toBe(true);
    });

    it("should return same object reference on multiple calls", () => {
      const limits = new LimitsNamespace();

      const config1 = limits.get();
      const config2 = limits.get();

      // Same frozen object (performance optimization)
      expect(config1).toBe(config2);
    });

    it("should throw when attempting to mutate returned object", () => {
      const limits = new LimitsNamespace();
      const config = limits.get();

      // Mutations should throw in strict mode (Vitest runs in strict mode)
      expect(() => {
        // @ts-expect-error - testing runtime behavior
        config.maxPlugins = 999;
      }).toThrowError(TypeError);

      expect(() => {
        // @ts-expect-error - testing runtime behavior
        config.maxDependencies = 999;
      }).toThrowError(TypeError);

      expect(() => {
        // @ts-expect-error - testing runtime behavior
        config.maxMiddleware = 999;
      }).toThrowError(TypeError);
    });
  });

  describe("getLimit", () => {
    it("should return specific limit value", () => {
      const limits = new LimitsNamespace({
        maxPlugins: 100,
      });

      expect(limits.getLimit("maxPlugins")).toBe(100);
      expect(limits.getLimit("maxDependencies")).toBe(
        DEFAULT_LIMITS.maxDependencies,
      );
    });

    it("should return correct value for all limit types", () => {
      const customLimits = {
        maxDependencies: 150,
        maxPlugins: 75,
        maxMiddleware: 60,
        maxListeners: 15_000,
        maxEventDepth: 10,
        maxLifecycleHandlers: 300,
      };

      const limits = new LimitsNamespace(customLimits);

      expect(limits.getLimit("maxDependencies")).toBe(150);
      expect(limits.getLimit("maxPlugins")).toBe(75);
      expect(limits.getLimit("maxMiddleware")).toBe(60);
      expect(limits.getLimit("maxListeners")).toBe(15_000);
      expect(limits.getLimit("maxEventDepth")).toBe(10);
      expect(limits.getLimit("maxLifecycleHandlers")).toBe(300);
    });
  });

  describe("validateLimitName", () => {
    it("should throw TypeError for non-string limit name", () => {
      expect(() => {
        LimitsNamespace.validateLimitName(123, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitName(null, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitName(undefined, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitName({}, "testMethod");
      }).toThrowError(TypeError);
    });

    it("should not throw for valid string limit name", () => {
      expect(() => {
        LimitsNamespace.validateLimitName("maxPlugins", "testMethod");
      }).not.toThrowError();
    });
  });

  describe("validateLimitExists", () => {
    it("should throw ReferenceError for unknown limit name", () => {
      expect(() => {
        LimitsNamespace.validateLimitExists("unknownLimit", "testMethod");
      }).toThrowError(ReferenceError);

      expect(() => {
        LimitsNamespace.validateLimitExists("maxFoo", "testMethod");
      }).toThrowError(ReferenceError);
    });

    it("should not throw for valid limit names", () => {
      expect(() => {
        LimitsNamespace.validateLimitExists("maxPlugins", "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitExists("maxDependencies", "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitExists("maxMiddleware", "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitExists("maxListeners", "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitExists("maxEventDepth", "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitExists(
          "maxLifecycleHandlers",
          "testMethod",
        );
      }).not.toThrowError();
    });
  });

  describe("validateLimitValue", () => {
    it("should throw TypeError for non-number value", () => {
      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", "50", "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", null, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          undefined,
          "testMethod",
        );
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", {}, "testMethod");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for non-integer value", () => {
      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", 50.5, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", 3.14, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          Number.NaN,
          "testMethod",
        );
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          Number.POSITIVE_INFINITY,
          "testMethod",
        );
      }).toThrowError(TypeError);
    });

    it("should throw RangeError for value below minimum", () => {
      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", 0, "testMethod");
      }).toThrowError(RangeError);

      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", -1, "testMethod");
      }).toThrowError(RangeError);

      expect(() => {
        LimitsNamespace.validateLimitValue("maxEventDepth", 0, "testMethod");
      }).toThrowError(RangeError);
    });

    it("should throw RangeError for value above maximum", () => {
      const maxPluginsMax = LIMIT_BOUNDS.maxPlugins.max;

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          maxPluginsMax + 1,
          "testMethod",
        );
      }).toThrowError(RangeError);

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          maxPluginsMax + 1000,
          "testMethod",
        );
      }).toThrowError(RangeError);
    });

    it("should not throw for valid values within bounds", () => {
      expect(() => {
        LimitsNamespace.validateLimitValue("maxPlugins", 50, "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          LIMIT_BOUNDS.maxPlugins.min,
          "testMethod",
        );
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxPlugins",
          LIMIT_BOUNDS.maxPlugins.max,
          "testMethod",
        );
      }).not.toThrowError();
    });

    it("should validate bounds for all limit types", () => {
      // maxDependencies
      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxDependencies",
          LIMIT_BOUNDS.maxDependencies.min,
          "testMethod",
        );
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxDependencies",
          LIMIT_BOUNDS.maxDependencies.max,
          "testMethod",
        );
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxDependencies",
          LIMIT_BOUNDS.maxDependencies.max + 1,
          "testMethod",
        );
      }).toThrowError(RangeError);

      // maxListeners
      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxListeners",
          LIMIT_BOUNDS.maxListeners.max,
          "testMethod",
        );
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxListeners",
          LIMIT_BOUNDS.maxListeners.max + 1,
          "testMethod",
        );
      }).toThrowError(RangeError);

      // maxEventDepth
      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxEventDepth",
          LIMIT_BOUNDS.maxEventDepth.max,
          "testMethod",
        );
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimitValue(
          "maxEventDepth",
          LIMIT_BOUNDS.maxEventDepth.max + 1,
          "testMethod",
        );
      }).toThrowError(RangeError);
    });
  });

  describe("validateLimits", () => {
    it("should throw TypeError for non-object limits", () => {
      expect(() => {
        LimitsNamespace.validateLimits(null, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits(undefined, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits("string", "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits(123, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits([], "testMethod");
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for unknown limit keys", () => {
      expect(() => {
        LimitsNamespace.validateLimits({ unknownLimit: 100 }, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits(
          { maxPlugins: 50, invalidKey: 100 },
          "testMethod",
        );
      }).toThrowError(TypeError);
    });

    it("should throw for invalid limit values", () => {
      expect(() => {
        LimitsNamespace.validateLimits({ maxPlugins: "50" }, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits({ maxPlugins: 50.5 }, "testMethod");
      }).toThrowError(TypeError);

      expect(() => {
        LimitsNamespace.validateLimits({ maxPlugins: -1 }, "testMethod");
      }).toThrowError(RangeError);

      expect(() => {
        LimitsNamespace.validateLimits(
          { maxPlugins: LIMIT_BOUNDS.maxPlugins.max + 1 },
          "testMethod",
        );
      }).toThrowError(RangeError);
    });

    it("should not throw for valid partial limits", () => {
      expect(() => {
        LimitsNamespace.validateLimits({}, "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimits({ maxPlugins: 50 }, "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimits(
          { maxPlugins: 50, maxMiddleware: 75 },
          "testMethod",
        );
      }).not.toThrowError();
    });

    it("should not throw for valid complete limits", () => {
      expect(() => {
        LimitsNamespace.validateLimits(
          {
            maxDependencies: 150,
            maxPlugins: 75,
            maxMiddleware: 60,
            maxListeners: 15_000,
            maxEventDepth: 10,
            maxLifecycleHandlers: 300,
          },
          "testMethod",
        );
      }).not.toThrowError();
    });

    it("should allow undefined values in partial limits", () => {
      expect(() => {
        LimitsNamespace.validateLimits({ maxPlugins: undefined }, "testMethod");
      }).not.toThrowError();

      expect(() => {
        LimitsNamespace.validateLimits(
          { maxPlugins: 50, maxMiddleware: undefined },
          "testMethod",
        );
      }).not.toThrowError();
    });
  });

  describe("computeThresholds", () => {
    it("should compute WARN as 20% of limit", () => {
      expect(computeThresholds(100).warn).toBe(20);
      expect(computeThresholds(50).warn).toBe(10);
      expect(computeThresholds(200).warn).toBe(40);
      expect(computeThresholds(1000).warn).toBe(200);
    });

    it("should compute ERROR as 50% of limit", () => {
      expect(computeThresholds(100).error).toBe(50);
      expect(computeThresholds(50).error).toBe(25);
      expect(computeThresholds(200).error).toBe(100);
      expect(computeThresholds(1000).error).toBe(500);
    });

    it("should floor fractional results", () => {
      // 20% of 55 = 11.0
      expect(computeThresholds(55).warn).toBe(11);
      // 50% of 55 = 27.5 → 27
      expect(computeThresholds(55).error).toBe(27);

      // 20% of 33 = 6.6 → 6
      expect(computeThresholds(33).warn).toBe(6);
      // 50% of 33 = 16.5 → 16
      expect(computeThresholds(33).error).toBe(16);
    });

    it("should handle edge cases", () => {
      // Minimum limit (1)
      expect(computeThresholds(1).warn).toBe(0);
      expect(computeThresholds(1).error).toBe(0);

      // Small limits
      expect(computeThresholds(5).warn).toBe(1);
      expect(computeThresholds(5).error).toBe(2);

      // Large limits
      expect(computeThresholds(10_000).warn).toBe(2000);
      expect(computeThresholds(10_000).error).toBe(5000);
    });
  });

  describe("default limits values", () => {
    it("should match documented defaults", () => {
      expect(DEFAULT_LIMITS.maxDependencies).toBe(100);
      expect(DEFAULT_LIMITS.maxPlugins).toBe(50);
      expect(DEFAULT_LIMITS.maxMiddleware).toBe(50);
      expect(DEFAULT_LIMITS.maxListeners).toBe(10_000);
      expect(DEFAULT_LIMITS.maxEventDepth).toBe(5);
      expect(DEFAULT_LIMITS.maxLifecycleHandlers).toBe(200);
    });
  });

  describe("limit bounds", () => {
    it("should have valid min/max ranges", () => {
      // All minimums should be at least 1
      expect(LIMIT_BOUNDS.maxDependencies.min).toBeGreaterThanOrEqual(1);
      expect(LIMIT_BOUNDS.maxPlugins.min).toBeGreaterThanOrEqual(1);
      expect(LIMIT_BOUNDS.maxMiddleware.min).toBeGreaterThanOrEqual(1);
      expect(LIMIT_BOUNDS.maxListeners.min).toBeGreaterThanOrEqual(1);
      expect(LIMIT_BOUNDS.maxEventDepth.min).toBeGreaterThanOrEqual(1);
      expect(LIMIT_BOUNDS.maxLifecycleHandlers.min).toBeGreaterThanOrEqual(1);

      // All maximums should be greater than minimums
      expect(LIMIT_BOUNDS.maxDependencies.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxDependencies.min,
      );
      expect(LIMIT_BOUNDS.maxPlugins.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxPlugins.min,
      );
      expect(LIMIT_BOUNDS.maxMiddleware.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxMiddleware.min,
      );
      expect(LIMIT_BOUNDS.maxListeners.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxListeners.min,
      );
      expect(LIMIT_BOUNDS.maxEventDepth.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxEventDepth.min,
      );
      expect(LIMIT_BOUNDS.maxLifecycleHandlers.max).toBeGreaterThan(
        LIMIT_BOUNDS.maxLifecycleHandlers.min,
      );
    });

    it("should have defaults within bounds", () => {
      // maxDependencies
      expect(DEFAULT_LIMITS.maxDependencies).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxDependencies.min,
      );
      expect(DEFAULT_LIMITS.maxDependencies).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxDependencies.max,
      );

      // maxPlugins
      expect(DEFAULT_LIMITS.maxPlugins).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxPlugins.min,
      );
      expect(DEFAULT_LIMITS.maxPlugins).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxPlugins.max,
      );

      // maxMiddleware
      expect(DEFAULT_LIMITS.maxMiddleware).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxMiddleware.min,
      );
      expect(DEFAULT_LIMITS.maxMiddleware).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxMiddleware.max,
      );

      // maxListeners
      expect(DEFAULT_LIMITS.maxListeners).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxListeners.min,
      );
      expect(DEFAULT_LIMITS.maxListeners).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxListeners.max,
      );

      // maxEventDepth
      expect(DEFAULT_LIMITS.maxEventDepth).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxEventDepth.min,
      );
      expect(DEFAULT_LIMITS.maxEventDepth).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxEventDepth.max,
      );

      // maxLifecycleHandlers
      expect(DEFAULT_LIMITS.maxLifecycleHandlers).toBeGreaterThanOrEqual(
        LIMIT_BOUNDS.maxLifecycleHandlers.min,
      );
      expect(DEFAULT_LIMITS.maxLifecycleHandlers).toBeLessThanOrEqual(
        LIMIT_BOUNDS.maxLifecycleHandlers.max,
      );
    });
  });
});
