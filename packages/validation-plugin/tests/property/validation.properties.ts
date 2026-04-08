import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  validRouteNameArbitrary,
  nonStringArbitrary,
  validParamsArbitrary,
  invalidParamsArbitrary,
  validStartPathArbitrary,
  invalidStartPathArbitrary,
  validEventNameArbitrary,
  invalidEventNameArbitrary,
  validPluginArbitrary,
  unknownPluginKeyArbitrary,
  validInterceptorMethodArbitrary,
  invalidInterceptorMethodArbitrary,
  validHandlerArbitrary,
  invalidHandlerArbitrary,
  validDependencyNameArbitrary,
  plainObjectArbitrary,
  nonObjectNonUndefinedArbitrary,
  nonPlainObjectArbitrary,
  NUM_RUNS,
} from "./helpers";
import {
  validateDependencyName,
  validateSetDependencyArgs,
  validateDependenciesObject,
  validateDependencyLimit,
} from "../../src/validators/dependencies";
import {
  validateEventName,
  validateListenerArgs,
} from "../../src/validators/eventBus";
import {
  validateHandler,
  validateHandlerLimit,
} from "../../src/validators/lifecycle";
import {
  validateNavigateArgs,
  validateNavigateToDefaultArgs,
  validateNavigateParams,
  validateStartArgs,
} from "../../src/validators/navigation";
import { validateLimitValue } from "../../src/validators/options";
import {
  validatePluginKeys,
  validatePluginLimit,
  validateAddInterceptorArgs,
} from "../../src/validators/plugins";
import {
  validateBuildPathArgs,
  validateMatchPathArgs,
  validateIsActiveRouteArgs,
  validateRemoveRouteArgs,
  validateUpdateRouteBasicArgs,
  validateShouldUpdateNodeArgs,
  validateSetRootPathArgs,
} from "../../src/validators/routes";
import { validateMakeStateArgs } from "../../src/validators/state";

// =============================================================================
// Navigation namespace
// =============================================================================

describe("validateNavigateArgs — property-based", () => {
  test.prop([fc.string({ minLength: 0, maxLength: 30 })], {
    numRuns: NUM_RUNS.standard,
  })("any string never throws", (name) => {
    expect(() => {
      validateNavigateArgs(name);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateNavigateArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateNavigateParams — property-based", () => {
  test.prop([validParamsArbitrary], { numRuns: NUM_RUNS.standard })(
    "valid params object never throws",
    (params) => {
      expect(() => {
        validateNavigateParams(params, "navigate");
      }).not.toThrow();
    },
  );

  test.prop([invalidParamsArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-object params always throws TypeError",
    (params) => {
      expect(() => {
        validateNavigateParams(params, "navigate");
      }).toThrow(TypeError);
    },
  );

  test("undefined params never throws", () => {
    expect(() => {
      validateNavigateParams(undefined, "navigate");
    }).not.toThrow();
  });
});

describe("validateNavigateToDefaultArgs — property-based", () => {
  test("undefined always passes", () => {
    expect(() => {
      validateNavigateToDefaultArgs(undefined);
    }).not.toThrow();
  });

  test.prop([validParamsArbitrary], { numRuns: NUM_RUNS.standard })(
    "plain objects never throw",
    (opts) => {
      expect(() => {
        validateNavigateToDefaultArgs(opts);
      }).not.toThrow();
    },
  );

  test.prop(
    [fc.oneof(fc.constant(null), fc.string(), fc.integer(), fc.boolean())],
    { numRuns: NUM_RUNS.standard },
  )("non-object, non-undefined inputs always throw TypeError", (value) => {
    expect(() => {
      validateNavigateToDefaultArgs(value);
    }).toThrow(TypeError);
  });
});

describe("validateStartArgs — property-based", () => {
  test("undefined always passes", () => {
    expect(() => {
      validateStartArgs(undefined);
    }).not.toThrow();
  });

  test.prop([validStartPathArbitrary], { numRuns: NUM_RUNS.standard })(
    'paths starting with "/" never throw',
    (path) => {
      expect(() => {
        validateStartArgs(path);
      }).not.toThrow();
    },
  );

  test("empty string never throws", () => {
    expect(() => {
      validateStartArgs("");
    }).not.toThrow();
  });

  test.prop([invalidStartPathArbitrary], { numRuns: NUM_RUNS.standard })(
    'non-"/" prefix strings always throw TypeError',
    (path) => {
      expect(() => {
        validateStartArgs(path);
      }).toThrow(TypeError);
    },
  );

  test.prop(
    [fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant([]))],
    { numRuns: NUM_RUNS.standard },
  )("non-string, non-undefined inputs always throw TypeError", (value) => {
    expect(() => {
      validateStartArgs(value);
    }).toThrow(TypeError);
  });
});

// =============================================================================
// Routes namespace
// =============================================================================

describe("validateBuildPathArgs — property-based", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 30 })], {
    numRuns: NUM_RUNS.standard,
  })("non-empty strings never throw", (route) => {
    expect(() => {
      validateBuildPathArgs(route);
    }).not.toThrow();
  });

  test("empty string throws TypeError", () => {
    expect(() => {
      validateBuildPathArgs("");
    }).toThrow(TypeError);
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateBuildPathArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateMatchPathArgs — property-based", () => {
  test.prop([fc.string({ minLength: 0, maxLength: 30 })], {
    numRuns: NUM_RUNS.standard,
  })("any string never throws", (path) => {
    expect(() => {
      validateMatchPathArgs(path);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateMatchPathArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateRemoveRouteArgs — property-based", () => {
  test.prop([validRouteNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "valid route name strings never throw",
    (name) => {
      expect(() => {
        validateRemoveRouteArgs(name);
      }).not.toThrow();
    },
  );

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateRemoveRouteArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateIsActiveRouteArgs — property-based", () => {
  test.prop(
    [
      validRouteNameArbitrary,
      fc.option(validParamsArbitrary, { nil: undefined }),
      fc.option(fc.boolean(), { nil: undefined }),
      fc.option(fc.boolean(), { nil: undefined }),
    ],
    { numRuns: NUM_RUNS.standard },
  )("valid args never throw", (name, params, strict, ignoreQP) => {
    expect(() => {
      validateIsActiveRouteArgs(name, params, strict, ignoreQP);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string name always throws TypeError",
    (name) => {
      expect(() => {
        validateIsActiveRouteArgs(name, undefined, undefined, undefined);
      }).toThrow(TypeError);
    },
  );

  test.prop([validRouteNameArbitrary, invalidParamsArbitrary], {
    numRuns: NUM_RUNS.standard,
  })("invalid params always throws TypeError", (name, params) => {
    expect(() => {
      validateIsActiveRouteArgs(name, params, undefined, undefined);
    }).toThrow(TypeError);
  });
});

describe("validateShouldUpdateNodeArgs — property-based", () => {
  test.prop([fc.string({ minLength: 0, maxLength: 30 })], {
    numRuns: NUM_RUNS.standard,
  })("any string never throws", (name) => {
    expect(() => {
      validateShouldUpdateNodeArgs(name);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateShouldUpdateNodeArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateSetRootPathArgs — property-based", () => {
  test.prop([fc.string({ minLength: 0, maxLength: 30 })], {
    numRuns: NUM_RUNS.standard,
  })("any string never throws", (path) => {
    expect(() => {
      validateSetRootPathArgs(path);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateSetRootPathArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateUpdateRouteBasicArgs — property-based", () => {
  test.prop([validRouteNameArbitrary, validParamsArbitrary], {
    numRuns: NUM_RUNS.standard,
  })("valid name + plain object never throws", (name, updates) => {
    expect(() => {
      validateUpdateRouteBasicArgs(name, updates);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string name always throws TypeError",
    (name) => {
      expect(() => {
        validateUpdateRouteBasicArgs(name, {});
      }).toThrow(TypeError);
    },
  );

  test("null updates throws TypeError", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("test", null);
    }).toThrow(TypeError);
  });

  test("array updates throws TypeError", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("test", [1, 2]);
    }).toThrow(TypeError);
  });

  test("empty name throws ReferenceError", () => {
    expect(() => {
      validateUpdateRouteBasicArgs("", {});
    }).toThrow(ReferenceError);
  });
});

// =============================================================================
// State namespace
// =============================================================================

describe("validateMakeStateArgs — property-based", () => {
  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.option(validParamsArbitrary, { nil: undefined }),
      fc.option(
        fc.string({ minLength: 1, maxLength: 30 }).map((s) => `/${s}`),
        { nil: undefined },
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("valid args never throw", (name, params, path) => {
    expect(() => {
      validateMakeStateArgs(name, params, path);
    }).not.toThrow();
  });

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string name always throws TypeError",
    (name) => {
      expect(() => {
        validateMakeStateArgs(name, undefined, undefined);
      }).toThrow(TypeError);
    },
  );

  test.prop(
    [fc.string({ minLength: 1, maxLength: 10 }), invalidParamsArbitrary],
    { numRuns: NUM_RUNS.standard },
  )("invalid params always throws TypeError", (name, params) => {
    expect(() => {
      validateMakeStateArgs(name, params, undefined);
    }).toThrow(TypeError);
  });

  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant([])),
    ],
    { numRuns: NUM_RUNS.standard },
  )("non-string path always throws TypeError", (name, path) => {
    expect(() => {
      validateMakeStateArgs(name, undefined, path);
    }).toThrow(TypeError);
  });
});

// =============================================================================
// EventBus namespace
// =============================================================================

describe("validateEventName — property-based", () => {
  test.prop([validEventNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "valid event names never throw",
    (name) => {
      expect(() => {
        validateEventName(name);
      }).not.toThrow();
    },
  );

  test.prop([invalidEventNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "invalid event names always throw TypeError",
    (name) => {
      expect(() => {
        validateEventName(name);
      }).toThrow(TypeError);
    },
  );
});

describe("validateListenerArgs — property-based", () => {
  test.prop([validEventNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "valid event name + function never throws",
    (name) => {
      expect(() => {
        validateListenerArgs(name, (() => {}) as any);
      }).not.toThrow();
    },
  );

  test.prop(
    [
      validEventNameArbitrary,
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("valid event name + non-function always throws TypeError", (name, cb) => {
    expect(() => {
      validateListenerArgs(name, cb as any);
    }).toThrow(TypeError);
  });
});

// =============================================================================
// Plugins namespace
// =============================================================================

describe("validatePluginKeys — property-based", () => {
  test.prop([validPluginArbitrary], { numRuns: NUM_RUNS.standard })(
    "plugins with only valid keys never throw",
    (plugin) => {
      expect(() => {
        validatePluginKeys(plugin);
      }).not.toThrow();
    },
  );

  test.prop([validPluginArbitrary, unknownPluginKeyArbitrary], {
    numRuns: NUM_RUNS.standard,
  })("plugins with unknown keys always throw TypeError", (plugin, extraKey) => {
    const badPlugin = { ...plugin, [extraKey]: () => {} };

    expect(() => {
      validatePluginKeys(badPlugin);
    }).toThrow(TypeError);
    expect(() => {
      validatePluginKeys(badPlugin);
    }).toThrow("Unknown property");
  });
});

describe("validatePluginLimit — property-based", () => {
  test.prop(
    [fc.integer({ min: 0, max: 49 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: NUM_RUNS.standard },
  )("count within limit never throws", (current, max) => {
    // Ensure current + 1 <= max
    const safeMax = Math.max(current + 1, max);

    expect(() => {
      validatePluginLimit(current, 1, safeMax);
    }).not.toThrow();
  });

  test.prop([fc.integer({ min: 1, max: 1000 })], {
    numRuns: NUM_RUNS.standard,
  })("count exceeding limit always throws RangeError", (max) => {
    expect(() => {
      validatePluginLimit(max, 1, max);
    }).toThrow(RangeError);
  });

  test("maxPlugins=0 disables limit check (never throws)", () => {
    expect(() => {
      validatePluginLimit(999, 1, 0);
    }).not.toThrow();
  });
});

describe("validateAddInterceptorArgs — property-based", () => {
  test.prop([validInterceptorMethodArbitrary], { numRuns: NUM_RUNS.standard })(
    "valid method + function never throws",
    (method) => {
      expect(() => {
        validateAddInterceptorArgs(method, () => {});
      }).not.toThrow();
    },
  );

  test.prop([invalidInterceptorMethodArbitrary], {
    numRuns: NUM_RUNS.standard,
  })("invalid method always throws TypeError", (method) => {
    expect(() => {
      validateAddInterceptorArgs(method, () => {});
    }).toThrow(TypeError);
  });

  test.prop(
    [
      validInterceptorMethodArbitrary,
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    ],
    { numRuns: NUM_RUNS.standard },
  )("valid method + non-function always throws TypeError", (method, fn) => {
    expect(() => {
      validateAddInterceptorArgs(method, fn);
    }).toThrow(TypeError);
  });
});

// =============================================================================
// Lifecycle namespace
// =============================================================================

describe("validateHandler — property-based", () => {
  test.prop([validHandlerArbitrary], { numRuns: NUM_RUNS.standard })(
    "boolean or function never throws",
    (handler) => {
      expect(() => {
        validateHandler(handler, "canActivate");
      }).not.toThrow();
    },
  );

  test.prop([invalidHandlerArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-boolean non-function always throws TypeError",
    (handler) => {
      expect(() => {
        validateHandler(handler, "canActivate");
      }).toThrow(TypeError);
    },
  );
});

describe("validateHandlerLimit — property-based", () => {
  test.prop([fc.integer({ min: 0, max: 199 })], { numRuns: NUM_RUNS.standard })(
    "count below default limit (200) never throws",
    (count) => {
      expect(() => {
        validateHandlerLimit(count, "canActivate");
      }).not.toThrow();
    },
  );

  test.prop([fc.integer({ min: 200, max: 10_000 })], {
    numRuns: NUM_RUNS.standard,
  })("count at or above default limit always throws RangeError", (count) => {
    expect(() => {
      validateHandlerLimit(count, "canActivate");
    }).toThrow(RangeError);
  });

  test.prop([fc.integer({ min: 1, max: 10_000 })], {
    numRuns: NUM_RUNS.standard,
  })("count at custom limit always throws RangeError", (max) => {
    expect(() => {
      validateHandlerLimit(max, "canActivate", max);
    }).toThrow(RangeError);
  });

  test("maxLifecycleHandlers=0 disables limit check (never throws)", () => {
    expect(() => {
      validateHandlerLimit(9999, "canActivate", 0);
    }).not.toThrow();
  });
});

// =============================================================================
// Dependencies namespace
// =============================================================================

describe("validateDependencyName — property-based", () => {
  test.prop([validDependencyNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "any string never throws",
    (name) => {
      expect(() => {
        validateDependencyName(name, "getDependency");
      }).not.toThrow();
    },
  );

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateDependencyName(value, "getDependency");
      }).toThrow(TypeError);
    },
  );
});

describe("validateSetDependencyArgs — property-based", () => {
  test.prop([validDependencyNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "any string never throws",
    (name) => {
      expect(() => {
        validateSetDependencyArgs(name);
      }).not.toThrow();
    },
  );

  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-string always throws TypeError",
    (value) => {
      expect(() => {
        validateSetDependencyArgs(value);
      }).toThrow(TypeError);
    },
  );
});

describe("validateDependenciesObject — property-based", () => {
  test.prop([plainObjectArbitrary], { numRuns: NUM_RUNS.standard })(
    "plain objects never throw",
    (obj) => {
      expect(() => {
        validateDependenciesObject(obj, "setDependencies");
      }).not.toThrow();
    },
  );

  test.prop([nonObjectNonUndefinedArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-objects always throw TypeError",
    (value) => {
      expect(() => {
        validateDependenciesObject(value, "setDependencies");
      }).toThrow(TypeError);
    },
  );

  test.prop([nonPlainObjectArbitrary], { numRuns: NUM_RUNS.standard })(
    "non-plain objects (Map, Set, Date, RegExp) always throw TypeError",
    (value) => {
      expect(() => {
        validateDependenciesObject(value, "setDependencies");
      }).toThrow(TypeError);
    },
  );

  test.prop(
    [
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    ],
    { numRuns: NUM_RUNS.standard },
  )("objects with getter properties always throw TypeError", (key, value) => {
    const obj = {};

    Object.defineProperty(obj, key, { get: () => value, enumerable: true });

    expect(() => {
      validateDependenciesObject(obj, "setDependencies");
    }).toThrow(TypeError);
    expect(() => {
      validateDependenciesObject(obj, "setDependencies");
    }).toThrow("Getters not allowed");
  });
});

describe("validateDependencyLimit — property-based", () => {
  test.prop(
    [fc.integer({ min: 0, max: 49 }), fc.integer({ min: 1, max: 50 })],
    { numRuns: NUM_RUNS.standard },
  )("count within limit never throws", (current, newCount) => {
    // Ensure current + newCount < max
    const safeMax = current + newCount + 1;

    expect(() => {
      validateDependencyLimit(current, newCount, "setDependency", safeMax);
    }).not.toThrow();
  });

  test.prop([fc.integer({ min: 1, max: 10_000 })], {
    numRuns: NUM_RUNS.standard,
  })("count meeting limit always throws RangeError", (max) => {
    expect(() => {
      validateDependencyLimit(max, 0, "setDependency", max);
    }).toThrow(RangeError);
  });

  test("maxDependencies=0 disables limit check (never throws)", () => {
    expect(() => {
      validateDependencyLimit(9999, 1, "setDependency", 0);
    }).not.toThrow();
  });
});

// =============================================================================
// Options namespace — validateLimitValue
// =============================================================================

describe("validateLimitValue — property-based", () => {
  test.prop([fc.integer({ min: 0, max: 10_000 })], {
    numRuns: NUM_RUNS.standard,
  })("valid maxDependencies integer in bounds never throws", (value) => {
    expect(() => {
      validateLimitValue("maxDependencies", value, "test");
    }).not.toThrow();
  });

  test.prop([fc.integer({ min: 0, max: 100 })], { numRuns: NUM_RUNS.standard })(
    "valid maxEventDepth integer in bounds never throws",
    (value) => {
      expect(() => {
        validateLimitValue("maxEventDepth", value, "test");
      }).not.toThrow();
    },
  );

  test.prop(
    [
      fc.oneof(
        fc.double().filter((n) => !Number.isInteger(n)),
        fc.constant(Number.NaN),
        fc.constant(Infinity),
        fc.constant(-Infinity),
        fc.string(),
        fc.boolean(),
        fc.constant(null),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("non-integer values always throw TypeError", (value) => {
    expect(() => {
      validateLimitValue("maxDependencies", value, "test");
    }).toThrow(TypeError);
  });

  test.prop([fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 10_001 }))], {
    numRuns: NUM_RUNS.standard,
  })("maxDependencies out of bounds always throws RangeError", (value) => {
    expect(() => {
      validateLimitValue("maxDependencies", value, "test");
    }).toThrow(RangeError);
  });

  test.prop([fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 101 }))], {
    numRuns: NUM_RUNS.standard,
  })("maxEventDepth out of bounds always throws RangeError", (value) => {
    expect(() => {
      validateLimitValue("maxEventDepth", value, "test");
    }).toThrow(RangeError);
  });
});

// =============================================================================
// Cross-cutting: idempotency
// =============================================================================

describe("idempotency — calling twice yields same result", () => {
  test.prop([nonStringArbitrary], { numRuns: NUM_RUNS.standard })(
    "validateNavigateArgs idempotent on invalid input",
    (value) => {
      const run = () => {
        validateNavigateArgs(value);
      };
      let threw1 = false;
      let threw2 = false;

      try {
        run();
      } catch {
        threw1 = true;
      }

      try {
        run();
      } catch {
        threw2 = true;
      }

      expect(threw1).toBe(threw2);
    },
  );

  test.prop([validEventNameArbitrary], { numRuns: NUM_RUNS.standard })(
    "validateEventName idempotent on valid input",
    (name) => {
      expect(() => {
        validateEventName(name);
      }).not.toThrow();
      expect(() => {
        validateEventName(name);
      }).not.toThrow();
    },
  );
});
