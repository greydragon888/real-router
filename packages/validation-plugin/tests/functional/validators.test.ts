import { logger } from "@real-router/logger";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { computeThresholds } from "../../src/helpers";
import {
  validateDependencyLimit,
  validateDependencyCount,
  validateCloneArgs,
  warnOverwrite as warnDepOverwrite,
  warnBatchOverwrite,
  warnRemoveNonExistent,
} from "../../src/validators/dependencies";
import {
  validateEventName,
  validateListenerArgs,
} from "../../src/validators/eventBus";
import {
  validateHandlerLimit,
  validateNotRegistering,
  validateLifecycleCountThresholds,
  warnOverwrite as warnLifecycleOverwrite,
  warnAsyncGuardSync,
} from "../../src/validators/lifecycle";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigationOptions,
} from "../../src/validators/navigation";
import {
  validateLimitValue,
  validateLimits,
  validateOptions,
} from "../../src/validators/options";
import {
  validatePluginLimit,
  validateCountThresholds as validatePluginCountThresholds,
  validatePluginKeys,
  warnBatchDuplicates,
  warnPluginMethodType,
  warnPluginAfterStart,
} from "../../src/validators/plugins";
import {
  validateSetRootPathArgs,
  guardRouteCallbacks,
  guardNoAsyncCallbacks,
} from "../../src/validators/routes";
import { validateMakeStateArgs } from "../../src/validators/state";

describe("options validators", () => {
  describe("validateLimitValue", () => {
    it("throws TypeError for non-integer (string)", () => {
      expect(() => {
        validateLimitValue("maxPlugins", "50", "test");
      }).toThrow(TypeError);
      expect(() => {
        validateLimitValue("maxPlugins", "50", "test");
      }).toThrow("must be an integer");
    });

    it("throws TypeError for float", () => {
      expect(() => {
        validateLimitValue("maxPlugins", 1.5, "test");
      }).toThrow(TypeError);
    });

    it("throws RangeError for negative value", () => {
      expect(() => {
        validateLimitValue("maxPlugins", -1, "test");
      }).toThrow(RangeError);
      expect(() => {
        validateLimitValue("maxPlugins", -1, "test");
      }).toThrow("must be between");
    });

    it("throws RangeError for value exceeding max", () => {
      expect(() => {
        validateLimitValue("maxPlugins", 10_000, "test");
      }).toThrow(RangeError);
    });

    it("accepts valid integer", () => {
      expect(() => {
        validateLimitValue("maxPlugins", 50, "test");
      }).not.toThrow();
    });

    it("accepts 0 (unlimited)", () => {
      expect(() => {
        validateLimitValue("maxPlugins", 0, "test");
      }).not.toThrow();
    });
  });

  describe("validateLimits", () => {
    it("throws TypeError for null", () => {
      expect(() => {
        validateLimits(null, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateLimits(null, "test");
      }).toThrow("expected plain object");
    });

    it("throws TypeError for array", () => {
      expect(() => {
        validateLimits([], "test");
      }).toThrow(TypeError);
    });

    it("throws TypeError for primitive", () => {
      expect(() => {
        validateLimits(123, "test");
      }).toThrow(TypeError);
    });

    it("throws TypeError for unknown limit key", () => {
      expect(() => {
        validateLimits({ unknownLimit: 50 }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateLimits({ unknownLimit: 50 }, "test");
      }).toThrow("unknown limit");
    });

    it("accepts valid limits object", () => {
      expect(() => {
        validateLimits({ maxPlugins: 10 }, "test");
      }).not.toThrow();
    });

    it("accepts empty limits object", () => {
      expect(() => {
        validateLimits({}, "test");
      }).not.toThrow();
    });

    it("skips undefined values", () => {
      expect(() => {
        validateLimits({ maxPlugins: undefined }, "test");
      }).not.toThrow();
    });

    it("validates all valid limit keys", () => {
      expect(() => {
        validateLimits(
          {
            maxDependencies: 50,
            maxPlugins: 10,
            maxListeners: 30,
            warnListeners: 20,
            maxEventDepth: 5,
            maxLifecycleHandlers: 100,
          },
          "test",
        );
      }).not.toThrow();
    });
  });
});

describe("lifecycle validators", () => {
  describe("validateHandlerLimit", () => {
    it("throws when count exceeds limit", () => {
      expect(() => {
        validateHandlerLimit(5, "test", 5);
      }).toThrow(/limit exceeded/);
    });

    it("does not throw when count is below limit", () => {
      expect(() => {
        validateHandlerLimit(4, "test", 5);
      }).not.toThrow();
    });

    it("does not throw when limit is 0 (unlimited)", () => {
      expect(() => {
        validateHandlerLimit(1000, "test", 0);
      }).not.toThrow();
    });

    it("uses default limit of 200", () => {
      expect(() => {
        validateHandlerLimit(200, "test");
      }).toThrow(/limit exceeded.*200/i);
    });
  });

  describe("validateNotRegistering", () => {
    it("throws when isRegistering is true", () => {
      expect(() => {
        validateNotRegistering(true, "home", "canActivate");
      }).toThrow(Error);
      expect(() => {
        validateNotRegistering(true, "home", "canActivate");
      }).toThrow(/Cannot modify route "home" during its own registration/);
    });

    it("does not throw when isRegistering is false", () => {
      expect(() => {
        validateNotRegistering(false, "home", "canActivate");
      }).not.toThrow();
    });
  });
});

describe("plugins validators", () => {
  describe("validatePluginLimit", () => {
    it("throws when count exceeds limit", () => {
      expect(() => {
        validatePluginLimit(5, 1, 5);
      }).toThrow(/Plugin limit exceeded/);
    });

    it("does not throw when count is below limit", () => {
      expect(() => {
        validatePluginLimit(4, 1, 5);
      }).not.toThrow();
    });

    it("does not throw when limit is 0 (unlimited)", () => {
      expect(() => {
        validatePluginLimit(1000, 1, 0);
      }).not.toThrow();
    });

    it("uses default limit of 50", () => {
      expect(() => {
        validatePluginLimit(50, 1);
      }).toThrow(/Plugin limit exceeded/);
    });
  });
});

describe("dependencies validators", () => {
  describe("validateDependencyLimit", () => {
    it("throws when count exceeds limit", () => {
      expect(() => {
        validateDependencyLimit(100, 1, "test", 100);
      }).toThrow(/Dependency limit exceeded/);
    });

    it("does not throw when count is below limit", () => {
      expect(() => {
        validateDependencyLimit(98, 1, "test", 100);
      }).not.toThrow();
    });

    it("does not throw when limit is 0 (unlimited)", () => {
      expect(() => {
        validateDependencyLimit(1000, 1, "test", 0);
      }).not.toThrow();
    });

    it("uses default limit of 100", () => {
      expect(() => {
        validateDependencyLimit(100, 1, "test");
      }).toThrow(/Dependency limit exceeded/);
    });
  });
});

describe("state validators", () => {
  describe("validateMakeStateArgs", () => {
    it("throws TypeError for non-string name", () => {
      expect(() => {
        validateMakeStateArgs(123, undefined, undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for invalid params", () => {
      expect(() => {
        validateMakeStateArgs("home", "string", undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for non-string path", () => {
      expect(() => {
        validateMakeStateArgs("home", undefined, 123);
      }).toThrow(TypeError);
    });

    it("accepts valid args", () => {
      expect(() => {
        validateMakeStateArgs("home", {}, "/home");
      }).not.toThrow();
    });
  });
});

describe("eventBus validators", () => {
  describe("validateEventName", () => {
    it("throws for invalid event name", () => {
      expect(() => {
        validateEventName("invalid");
      }).toThrow(/Invalid event name/);
    });

    it("accepts valid event names", () => {
      expect(() => {
        validateEventName("$start");
      }).not.toThrow();
      expect(() => {
        validateEventName("$stop");
      }).not.toThrow();
      expect(() => {
        validateEventName("$$start");
      }).not.toThrow();
      expect(() => {
        validateEventName("$$cancel");
      }).not.toThrow();
      expect(() => {
        validateEventName("$$success");
      }).not.toThrow();
      expect(() => {
        validateEventName("$$error");
      }).not.toThrow();
    });
  });

  describe("validateListenerArgs", () => {
    it("throws for invalid event name", () => {
      const raw = validateListenerArgs as unknown as (
        event: unknown,
        cb: unknown,
      ) => void;

      expect(() => {
        raw("invalid", () => {});
      }).toThrow();
    });

    it("throws TypeError for non-function callback", () => {
      expect(() => {
        validateListenerArgs("$start", "not-fn" as never);
      }).toThrow(TypeError);
    });

    it("accepts valid args", () => {
      expect(() => {
        validateListenerArgs("$start", () => {});
      }).not.toThrow();
    });
  });
});

describe("navigation validators", () => {
  describe("validateNavigateArgs", () => {
    it("throws TypeError for non-string name", () => {
      expect(() => {
        validateNavigateArgs(123);
      }).toThrow(TypeError);
    });

    it("accepts string name", () => {
      expect(() => {
        validateNavigateArgs("home");
      }).not.toThrow();
    });
  });

  describe("validateNavigateToDefaultArgs", () => {
    it("throws TypeError for non-object opts", () => {
      expect(() => {
        validateNavigateToDefaultArgs("string");
      }).toThrow(TypeError);
      expect(() => {
        validateNavigateToDefaultArgs(123);
      }).toThrow(TypeError);
    });

    it("accepts undefined opts", () => {
      expect(() => {
        validateNavigateToDefaultArgs(undefined);
      }).not.toThrow();
    });

    it("accepts object opts", () => {
      expect(() => {
        validateNavigateToDefaultArgs({ replace: true });
      }).not.toThrow();
    });
  });

  describe("validateNavigationOptions", () => {
    it("throws TypeError for invalid options", () => {
      expect(() => {
        validateNavigationOptions("string", "test");
      }).toThrow(TypeError);
      expect(() => {
        validateNavigationOptions(123, "test");
      }).toThrow(TypeError);
    });

    it("accepts valid NavigationOptions", () => {
      expect(() => {
        validateNavigationOptions({ replace: true }, "test");
      }).not.toThrow();
      expect(() => {
        validateNavigationOptions({}, "test");
      }).not.toThrow();
    });
  });
});

function makeStore(
  depCount: number,
  maxDeps?: number,
): {
  dependencies: Record<string, unknown>;
  limits?: { maxDependencies?: number };
} {
  const deps: Record<string, unknown> = {};

  for (let i = 0; i < depCount; i++) {
    deps[`dep${i}`] = i;
  }

  const result: {
    dependencies: Record<string, unknown>;
    limits?: { maxDependencies?: number };
  } = {
    dependencies: deps,
  };

  if (maxDeps !== undefined) {
    result.limits = { maxDependencies: maxDeps };
  }

  return result;
}

describe("helpers", () => {
  describe("computeThresholds", () => {
    it("returns 20% warn and 50% error thresholds", () => {
      expect(computeThresholds(100)).toStrictEqual({ warn: 20, error: 50 });
      expect(computeThresholds(200)).toStrictEqual({ warn: 40, error: 100 });
      expect(computeThresholds(50)).toStrictEqual({ warn: 10, error: 25 });
    });
  });
});

describe("Phase 2 dependency validators", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateDependencyCount", () => {
    it("returns early when maxDependencies is 0 (unlimited)", () => {
      expect(() => {
        validateDependencyCount(makeStore(999, 0), "test");
      }).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("throws when currentCount >= maxDependencies", () => {
      expect(() => {
        validateDependencyCount(makeStore(100, 100), "setDependency");
      }).toThrow("Dependency limit exceeded");
      expect(() => {
        validateDependencyCount(makeStore(105, 100), "setDependency");
      }).toThrow("Dependency limit exceeded");
    });

    it("calls logger.error when currentCount === error threshold", () => {
      const store = makeStore(50, 100);

      validateDependencyCount(store, "setDependency");

      expect(errorSpy).toHaveBeenCalledWith(
        "router.setDependency",
        expect.stringContaining("50 dependencies"),
      );
    });

    it("calls logger.warn when currentCount === warn threshold", () => {
      const store = makeStore(20, 100);

      validateDependencyCount(store, "setDependency");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.setDependency",
        expect.stringContaining("20 dependencies"),
      );
    });

    it("does nothing below thresholds", () => {
      validateDependencyCount(makeStore(5, 100), "setDependency");

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("uses default maxDependencies of 100 when limits absent", () => {
      expect(() => {
        const deps: Record<string, unknown> = {};

        for (let i = 0; i < 100; i++) {
          deps[`dep${i}`] = i;
        }

        validateDependencyCount({ dependencies: deps }, "setDependency");
      }).toThrow("Dependency limit exceeded");
    });
  });

  describe("validateCloneArgs", () => {
    it("returns early when dependencies is undefined", () => {
      expect(() => {
        validateCloneArgs(undefined);
      }).not.toThrow();
    });

    it("throws for null", () => {
      expect(() => {
        validateCloneArgs(null);
      }).toThrow(TypeError);
      expect(() => {
        validateCloneArgs(null);
      }).toThrow("expected plain object or undefined");
    });

    it("throws for arrays", () => {
      expect(() => {
        validateCloneArgs([]);
      }).toThrow(TypeError);
      expect(() => {
        validateCloneArgs(["a"]);
      }).toThrow("expected plain object or undefined");
    });

    it("throws for class instances", () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class Foo {}

      expect(() => {
        validateCloneArgs(new Foo());
      }).toThrow(TypeError);
    });

    it("throws when object has getters", () => {
      const objWithGetter = {};

      Object.defineProperty(objWithGetter, "key", {
        get: () => "value",
        enumerable: true,
      });

      expect(() => {
        validateCloneArgs(objWithGetter);
      }).toThrow(TypeError);
      expect(() => {
        validateCloneArgs(objWithGetter);
      }).toThrow("Getters not allowed");
    });

    it("accepts valid plain object", () => {
      expect(() => {
        validateCloneArgs({ a: 1, b: "two" });
      }).not.toThrow();
    });

    it("accepts empty plain object", () => {
      expect(() => {
        validateCloneArgs({});
      }).not.toThrow();
    });
  });

  describe("warnOverwrite (dependencies)", () => {
    it("calls logger.warn with dep name and method", () => {
      warnDepOverwrite("myDep", "setDependency");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.setDependency",
        expect.any(String),
        "myDep",
      );
    });
  });

  describe("warnBatchOverwrite", () => {
    it("calls logger.warn with joined keys", () => {
      warnBatchOverwrite(["dep1", "dep2"], "setDependencies");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.setDependencies",
        "Overwritten:",
        "dep1, dep2",
      );
    });
  });

  describe("warnRemoveNonExistent", () => {
    it("calls logger.warn with dep name string", () => {
      warnRemoveNonExistent("missingDep");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeDependency",
        expect.stringContaining("missingDep"),
      );
    });

    it("converts non-string names to string", () => {
      warnRemoveNonExistent(42);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.removeDependency",
        expect.stringContaining("42"),
      );
    });
  });
});

describe("Phase 2 lifecycle validators", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateLifecycleCountThresholds", () => {
    it("returns early when maxHandlers is 0 (unlimited)", () => {
      expect(() => {
        validateLifecycleCountThresholds(999, "addActivateGuard", 0);
      }).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("calls logger.error at error threshold", () => {
      validateLifecycleCountThresholds(100, "addActivateGuard", 200);

      expect(errorSpy).toHaveBeenCalledWith(
        "router.addActivateGuard",
        expect.stringContaining("100 lifecycle handlers"),
      );
    });

    it("calls logger.warn at warn threshold", () => {
      validateLifecycleCountThresholds(40, "addActivateGuard", 200);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.addActivateGuard",
        expect.stringContaining("40 lifecycle handlers"),
      );
    });

    it("does nothing below thresholds", () => {
      validateLifecycleCountThresholds(5, "addActivateGuard", 200);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("warnOverwrite (lifecycle)", () => {
    it("calls logger.warn with route name, type, and method", () => {
      warnLifecycleOverwrite("home", "activate", "addActivateGuard");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.addActivateGuard",
        expect.stringContaining("home"),
      );
    });
  });

  describe("warnAsyncGuardSync", () => {
    it("calls logger.warn for async guard in sync context", () => {
      warnAsyncGuardSync("home", "canNavigateTo");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.canNavigateTo",
        expect.stringContaining("home"),
      );
    });
  });
});

describe("Phase 2 options validators", () => {
  describe("validateOptions", () => {
    it("throws for null options", () => {
      expect(() => {
        validateOptions(null, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions(null, "test");
      }).toThrow("Invalid options");
    });

    it("throws for array options", () => {
      expect(() => {
        validateOptions([], "test");
      }).toThrow(TypeError);
    });

    it("throws for primitive options", () => {
      expect(() => {
        validateOptions("string", "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions(42, "test");
      }).toThrow(TypeError);
    });

    it("throws for unknown option key", () => {
      expect(() => {
        validateOptions({ unknownKey: "value" }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ unknownKey: "value" }, "test");
      }).toThrow('Unknown option: "unknownKey"');
    });

    it("throws for invalid trailingSlash (string value)", () => {
      expect(() => {
        validateOptions({ trailingSlash: "invalid" }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ trailingSlash: "invalid" }, "test");
      }).toThrow("trailingSlash");
    });

    it("throws for invalid trailingSlash (non-string value)", () => {
      expect(() => {
        validateOptions({ trailingSlash: 42 }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid queryParamsMode", () => {
      expect(() => {
        validateOptions({ queryParamsMode: "bad" }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid urlParamsEncoding", () => {
      expect(() => {
        validateOptions({ urlParamsEncoding: "bad" }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid allowNotFound (non-boolean)", () => {
      expect(() => {
        validateOptions({ allowNotFound: "yes" }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ allowNotFound: "yes" }, "test");
      }).toThrow("allowNotFound");
    });

    it("throws for invalid rewritePathOnMatch (non-boolean)", () => {
      expect(() => {
        validateOptions({ rewritePathOnMatch: 1 }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ rewritePathOnMatch: 1 }, "test");
      }).toThrow("rewritePathOnMatch");
    });

    it("throws for invalid defaultRoute", () => {
      expect(() => {
        validateOptions({ defaultRoute: 42 }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ defaultRoute: 42 }, "test");
      }).toThrow("defaultRoute");
    });

    it("throws for invalid defaultParams (array)", () => {
      expect(() => {
        validateOptions({ defaultParams: [] }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid defaultParams (null)", () => {
      expect(() => {
        validateOptions({ defaultParams: null }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid queryParams (non-object)", () => {
      expect(() => {
        validateOptions({ queryParams: "string" }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid queryParams (array)", () => {
      expect(() => {
        validateOptions({ queryParams: [] }, "test");
      }).toThrow(TypeError);
    });

    it("throws for unknown queryParams key", () => {
      expect(() => {
        validateOptions({ queryParams: { unknownParam: "x" } }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ queryParams: { unknownParam: "x" } }, "test");
      }).toThrow("unknown option");
    });

    it("throws for invalid queryParams.arrayFormat", () => {
      expect(() => {
        validateOptions({ queryParams: { arrayFormat: "bad" } }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid queryParams.booleanFormat", () => {
      expect(() => {
        validateOptions({ queryParams: { booleanFormat: "bad" } }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid queryParams.nullFormat", () => {
      expect(() => {
        validateOptions({ queryParams: { nullFormat: "bad" } }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid logger (non-object)", () => {
      expect(() => {
        validateOptions({ logger: "string" }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid logger (array)", () => {
      expect(() => {
        validateOptions({ logger: [] }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid logger.level (string value)", () => {
      expect(() => {
        validateOptions({ logger: { level: "bad" } }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ logger: { level: "bad" } }, "test");
      }).toThrow("logger.level");
    });

    it("throws for invalid logger.level (non-string value)", () => {
      expect(() => {
        validateOptions({ logger: { level: 99 } }, "test");
      }).toThrow(TypeError);
    });

    it("throws for invalid logger.callback (non-function)", () => {
      expect(() => {
        validateOptions({ logger: { callback: "not-fn" } }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ logger: { callback: "not-fn" } }, "test");
      }).toThrow("logger.callback");
    });

    it("throws for invalid logger.callbackIgnoresLevel (non-boolean)", () => {
      expect(() => {
        validateOptions({ logger: { callbackIgnoresLevel: "yes" } }, "test");
      }).toThrow(TypeError);
      expect(() => {
        validateOptions({ logger: { callbackIgnoresLevel: "yes" } }, "test");
      }).toThrow("logger.callbackIgnoresLevel");
    });

    it("accepts valid complete options", () => {
      expect(() => {
        validateOptions(
          {
            defaultRoute: "home",
            defaultParams: { tab: "overview" },
            trailingSlash: "preserve",
            queryParamsMode: "loose",
            urlParamsEncoding: "default",
            allowNotFound: true,
            rewritePathOnMatch: false,
            queryParams: {
              arrayFormat: "none",
              booleanFormat: "none",
              nullFormat: "default",
            },
            logger: {
              level: "warn-error",
              callback: () => {},
              callbackIgnoresLevel: false,
            },
            limits: { maxPlugins: 10 },
          },
          "test",
        );
      }).not.toThrow();
    });

    it("accepts partial options (undefined fields skipped)", () => {
      expect(() => {
        validateOptions({}, "test");
      }).not.toThrow();
      expect(() => {
        validateOptions({ trailingSlash: "never" }, "test");
      }).not.toThrow();
      expect(() => {
        validateOptions({ allowNotFound: false }, "test");
      }).not.toThrow();
    });

    it("accepts defaultRoute as function", () => {
      expect(() => {
        validateOptions({ defaultRoute: () => "home" }, "test");
      }).not.toThrow();
    });

    it("accepts defaultParams as function", () => {
      expect(() => {
        validateOptions({ defaultParams: () => ({}) }, "test");
      }).not.toThrow();
    });

    it("validates limits when present", () => {
      expect(() => {
        validateOptions({ limits: { maxPlugins: -1 } }, "test");
      }).toThrow(RangeError);
    });

    it("accepts undefined logger level (skips validation)", () => {
      expect(() => {
        validateOptions({ logger: {} }, "test");
      }).not.toThrow();
    });

    it("accepts undefined logger callback (skips validation)", () => {
      expect(() => {
        validateOptions({ logger: { level: "all" } }, "test");
      }).not.toThrow();
    });

    it("accepts undefined logger callbackIgnoresLevel (skips validation)", () => {
      expect(() => {
        validateOptions({ logger: { callback: () => {} } }, "test");
      }).not.toThrow();
    });
  });
});

describe("Phase 2 plugins validators", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateCountThresholds (plugins)", () => {
    it("returns early when maxPlugins is 0", () => {
      validatePluginCountThresholds(999, 0);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("calls logger.error at error threshold", () => {
      validatePluginCountThresholds(25, 50);

      expect(errorSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("25 plugins"),
      );
    });

    it("calls logger.warn at warn threshold", () => {
      validatePluginCountThresholds(10, 50);

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("10 plugins"),
      );
    });

    it("does nothing below thresholds", () => {
      validatePluginCountThresholds(5, 50);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("validatePluginKeys", () => {
    it("accepts valid plugin with known keys only", () => {
      expect(() => {
        validatePluginKeys({ onStart: () => {}, teardown: () => {} });
      }).not.toThrow();
      expect(() => {
        validatePluginKeys({});
      }).not.toThrow();
      expect(() => {
        validatePluginKeys({
          onStart: () => {},
          onStop: () => {},
          onTransitionStart: () => {},
          onTransitionSuccess: () => {},
          onTransitionError: () => {},
          onTransitionCancel: () => {},
          teardown: () => {},
        });
      }).not.toThrow();
    });

    it("throws for unknown property", () => {
      expect(() => {
        validatePluginKeys({ unknownProp: 42 });
      }).toThrow(TypeError);
      expect(() => {
        validatePluginKeys({ unknownProp: 42 });
      }).toThrow("Unknown property 'unknownProp'");
    });

    it("throws for unknown property alongside valid ones", () => {
      expect(() => {
        validatePluginKeys({ onStart: () => {}, badProp: "x" });
      }).toThrow(TypeError);
    });
  });

  describe("warnBatchDuplicates", () => {
    it("calls logger.warn", () => {
      warnBatchDuplicates();

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.any(String),
      );
    });
  });

  describe("warnPluginMethodType", () => {
    it("calls logger.warn with method name", () => {
      warnPluginMethodType("onStart");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.stringContaining("onStart"),
      );
    });
  });

  describe("warnPluginAfterStart", () => {
    it("calls logger.warn when methodName is onStart", () => {
      warnPluginAfterStart("onStart");

      expect(warnSpy).toHaveBeenCalledWith(
        "router.usePlugin",
        expect.any(String),
      );
    });

    it("does nothing when methodName is not onStart", () => {
      warnPluginAfterStart("onStop");

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe("Phase 2 routes validators", () => {
  describe("validateSetRootPathArgs", () => {
    it("accepts string rootPath", () => {
      expect(() => {
        validateSetRootPathArgs("/api");
      }).not.toThrow();
      expect(() => {
        validateSetRootPathArgs("");
      }).not.toThrow();
    });

    it("throws for non-string rootPath", () => {
      expect(() => {
        validateSetRootPathArgs(42);
      }).toThrow(TypeError);
      expect(() => {
        validateSetRootPathArgs(null);
      }).toThrow(TypeError);
      expect(() => {
        validateSetRootPathArgs(undefined);
      }).toThrow(TypeError);
    });
  });

  describe("guardRouteCallbacks", () => {
    it("accepts route with undefined callbacks", () => {
      expect(() => {
        guardRouteCallbacks({});
      }).not.toThrow();
    });

    it("accepts route with valid function callbacks", () => {
      expect(() => {
        guardRouteCallbacks({
          canActivate: () => () => true,
          canDeactivate: () => () => true,
        });
      }).not.toThrow();
    });

    it("throws when canActivate is not a function", () => {
      expect(() => {
        guardRouteCallbacks({ canActivate: "not-fn" });
      }).toThrow(TypeError);
      expect(() => {
        guardRouteCallbacks({ canActivate: "not-fn" });
      }).toThrow("canActivate must be a function");
    });

    it("throws when canDeactivate is not a function", () => {
      expect(() => {
        guardRouteCallbacks({ canDeactivate: 42 });
      }).toThrow(TypeError);
      expect(() => {
        guardRouteCallbacks({ canDeactivate: 42 });
      }).toThrow("canDeactivate must be a function");
    });

    it("throws when canActivate is null (not undefined, not function)", () => {
      expect(() => {
        guardRouteCallbacks({ canActivate: null });
      }).toThrow(TypeError);
    });
  });

  describe("guardNoAsyncCallbacks", () => {
    it("accepts route with no callbacks", () => {
      expect(() => {
        guardNoAsyncCallbacks({});
      }).not.toThrow();
    });

    it("accepts route with sync function callbacks", () => {
      expect(() => {
        guardNoAsyncCallbacks({
          decodeParams: (p: Record<string, unknown>) => p,
          encodeParams: (p: Record<string, unknown>) => p,
          forwardTo: () => "route",
        });
      }).not.toThrow();
    });

    it("throws when decodeParams is async", () => {
      expect(() => {
        guardNoAsyncCallbacks({ decodeParams: async () => ({}) });
      }).toThrow(TypeError);

      expect(() => {
        guardNoAsyncCallbacks({ decodeParams: async () => ({}) });
      }).toThrow("decodeParams cannot be async");
    });

    it("throws when encodeParams is async", () => {
      expect(() => {
        guardNoAsyncCallbacks({ encodeParams: async () => ({}) });
      }).toThrow(TypeError);

      expect(() => {
        guardNoAsyncCallbacks({ encodeParams: async () => ({}) });
      }).toThrow("encodeParams cannot be async");
    });

    it("throws when forwardTo is async function", () => {
      expect(() => {
        guardNoAsyncCallbacks({ forwardTo: async () => "route" });
      }).toThrow(TypeError);

      expect(() => {
        guardNoAsyncCallbacks({ forwardTo: async () => "route" });
      }).toThrow("forwardTo callback cannot be async");
    });

    it("accepts undefined callbacks (skips checks)", () => {
      expect(() => {
        guardNoAsyncCallbacks({ decodeParams: undefined });
      }).not.toThrow();
      expect(() => {
        guardNoAsyncCallbacks({ encodeParams: undefined });
      }).not.toThrow();
    });

    it("skips forwardTo if it is a string (not a function)", () => {
      expect(() => {
        guardNoAsyncCallbacks({ forwardTo: "some.route" });
      }).not.toThrow();
    });

    it("throws when decodeParams has __awaiter in toString (transpiled async branch)", () => {
      // Simulate transpiled async code: regular function (not AsyncFunction) whose
      // toString() contains "__awaiter" — same pattern TypeScript emits when targeting ES5
      function transpiledDecoder() {
        return "__awaiter";
      }

      expect(() => {
        guardNoAsyncCallbacks({ decodeParams: transpiledDecoder });
      }).toThrow(TypeError);

      expect(() => {
        guardNoAsyncCallbacks({ decodeParams: transpiledDecoder });
      }).toThrow("decodeParams cannot be async");
    });
  });
});
