import { describe, it, expect } from "vitest";

import { validateDependencyLimit } from "../../src/validators/dependencies";
import {
  validateEventName,
  validateListenerArgs,
} from "../../src/validators/eventBus";
import {
  validateHandlerLimit,
  validateNotRegistering,
} from "../../src/validators/lifecycle";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigationOptions,
} from "../../src/validators/navigation";
import {
  validateLimitValue,
  validateLimits,
} from "../../src/validators/options";
import { validatePluginLimit } from "../../src/validators/plugins";
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
        validateMakeStateArgs(123, undefined, undefined, undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for invalid params", () => {
      expect(() => {
        validateMakeStateArgs("home", "string", undefined, undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for non-string path", () => {
      expect(() => {
        validateMakeStateArgs("home", undefined, 123, undefined);
      }).toThrow(TypeError);
    });

    it("throws TypeError for non-number forceId", () => {
      expect(() => {
        validateMakeStateArgs("home", undefined, undefined, "string");
      }).toThrow(TypeError);
    });

    it("accepts valid args", () => {
      expect(() => {
        validateMakeStateArgs("home", {}, "/home", undefined);
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
