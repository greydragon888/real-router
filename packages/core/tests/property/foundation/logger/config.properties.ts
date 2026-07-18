import { fc, test } from "@fast-check/vitest";
import { describe, beforeEach, expect } from "vitest";

import {
  callbackArbitrary,
  invalidLevelArbitrary,
  logLevelConfigArbitrary,
  LOG_LEVEL_CONFIGS,
  protoCallbackConfigArbitrary,
} from "./helpers";
import { RouterLogger } from "../../../../src/foundation/logger/RouterLogger";

import type { LogLevelConfig } from "@real-router/types";

// Per-router logger instance under test (fresh per test in beforeEach) —
// replaces the former process-global singleton.
let logger: RouterLogger;

describe("Logger Configuration Properties", () => {
  beforeEach(() => {
    // Fresh instance per test (defaults: level "all", callback undefined,
    // callbackIgnoresLevel false) — replaces the former singleton reset.
    logger = new RouterLogger();
  });

  describe("Configuration idempotence", () => {
    test.prop([logLevelConfigArbitrary, callbackArbitrary, fc.boolean()], {
      numRuns: 5000,
    })(
      "configuration with same parameters gives same result",
      (level, getCallback, callbackIgnoresLevel) => {
        const callback = getCallback();

        // Apply configuration twice
        logger.configure({ level, callback, callbackIgnoresLevel });
        const config1 = logger.getConfig();

        logger.configure({ level, callback, callbackIgnoresLevel });
        const config2 = logger.getConfig();

        // Check that result is the same
        expect(config1.level).toBe(config2.level);
        expect(config1.callback).toBe(config2.callback);
        expect(config1.callbackIgnoresLevel).toBe(config2.callbackIgnoresLevel);
      },
    );
  });

  describe("Partial configuration updates", () => {
    test.prop(
      [logLevelConfigArbitrary, logLevelConfigArbitrary, callbackArbitrary],
      { numRuns: 5000 },
    )(
      "partial updates preserve other fields",
      (level1, level2, getCallback) => {
        const callback = getCallback();

        // Set initial configuration
        logger.configure({
          level: level1,
          callback,
          callbackIgnoresLevel: true,
        });

        // Update only level
        logger.configure({ level: level2 });

        const config = logger.getConfig();

        // Check that level changed while callback and callbackIgnoresLevel preserved
        expect(config.level).toBe(level2);
        expect(config.callback).toBe(callback);
        expect(config.callbackIgnoresLevel).toBe(true);
      },
    );

    test.prop([logLevelConfigArbitrary, callbackArbitrary, callbackArbitrary], {
      numRuns: 5000,
    })(
      "partial callback update preserves level",
      (level, getCallback1, getCallback2) => {
        const callback1 = getCallback1();
        const callback2 = getCallback2();

        // Set initial configuration
        logger.configure({ level, callback: callback1 });

        // Update only callback
        logger.configure({ callback: callback2 });

        const config = logger.getConfig();

        // Check that callback changed while level preserved
        expect(config.level).toBe(level);
        expect(config.callback).toBe(callback2);
      },
    );
  });

  describe("Validity of returned configuration", () => {
    test.prop([logLevelConfigArbitrary, callbackArbitrary], { numRuns: 5000 })(
      "getConfig always returns valid level",
      (level, getCallback) => {
        const callback = getCallback();

        logger.configure({ level, callback });

        const config = logger.getConfig();

        // Check that level is valid
        expect(LOG_LEVEL_CONFIGS).toContain(config.level);
      },
    );

    test.prop([fc.boolean()], { numRuns: 5000 })(
      "getConfig always returns callbackIgnoresLevel as boolean",
      (callbackIgnoresLevel) => {
        logger.configure({ callbackIgnoresLevel });

        const config = logger.getConfig();

        // Check that callbackIgnoresLevel is always boolean
        expect(typeof config.callbackIgnoresLevel).toBe("boolean");
      },
    );

    test.prop([logLevelConfigArbitrary, callbackArbitrary], { numRuns: 5000 })(
      "getConfig returns new object on each call",
      (level, getCallback) => {
        const callback = getCallback();

        logger.configure({ level, callback });

        const config1 = logger.getConfig();
        const config2 = logger.getConfig();

        // Check that these are different objects (not same reference)
        expect(config1).not.toBe(config2);
        // But content is the same
        expect(config1).toStrictEqual(config2);
      },
    );
  });

  describe("Callback clearing", () => {
    test.prop([logLevelConfigArbitrary, callbackArbitrary], { numRuns: 5000 })(
      "setting callback to undefined clears callback",
      (level, getCallback) => {
        const callback = getCallback();

        // Set callback
        logger.configure({ level, callback });
        let config = logger.getConfig();

        expect(config.callback).toBe(callback);

        // Clear callback
        logger.configure({ callback: undefined });
        config = logger.getConfig();

        // Check that callback is cleared
        expect(config.callback).toBeUndefined();
        // level should be preserved
        expect(config.level).toBe(level);
      },
    );
  });

  describe("Own-property callback detection", () => {
    test.prop([protoCallbackConfigArbitrary], { numRuns: 1000 })(
      "a callback inherited from the prototype is ignored (own-property only)",
      (makeConfig) => {
        // Baseline: no callback installed.
        logger.configure({ callback: undefined });

        // A config whose `callback` lives on the prototype, not as an own key.
        logger.configure(makeConfig());

        // Own-property detection (#792): the inherited callback must NOT install.
        // Reverting to `"callback" in config` makes this property fail.
        expect(logger.getConfig().callback).toBeUndefined();
      },
    );
  });

  describe("Invalid level handling", () => {
    test.prop([invalidLevelArbitrary], { numRuns: 5000 })(
      "should throw error for invalid levels",
      (invalidLevel) => {
        // Check that error is thrown
        expect(() => {
          logger.configure({ level: invalidLevel as LogLevelConfig });
        }).toThrow(/Invalid log level/);
      },
    );
  });

  describe("Configuration atomicity on invalid level", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        callbackArbitrary,
        fc.boolean(),
        invalidLevelArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 5000 },
    )(
      "a configure rejected for an invalid level leaves every field unchanged",
      (
        startLevel,
        getStartCallback,
        startFlag,
        invalidLevel,
        getOtherCallback,
      ) => {
        const startCallback = getStartCallback();
        const otherCallback = getOtherCallback();

        // Establish a known-good baseline.
        logger.configure({
          level: startLevel,
          callback: startCallback,
          callbackIgnoresLevel: startFlag,
        });
        const before = logger.getConfig();

        // This patch would flip callback + callbackIgnoresLevel, but the invalid
        // level must make configure throw before applying ANY field.
        expect(() => {
          logger.configure({
            level: invalidLevel as LogLevelConfig,
            callback: otherCallback,
            callbackIgnoresLevel: !startFlag,
          });
        }).toThrow(/Invalid log level/);

        // Atomic rollback: not a single field changed.
        const after = logger.getConfig();

        expect(after).toStrictEqual(before);
      },
    );
  });

  describe("Level switching", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelConfigArbitrary,
        logLevelConfigArbitrary,
      ],
      { numRuns: 5000 },
    )("level switching works correctly", (level1, level2, level3) => {
      // Apply sequence of configurations
      logger.configure({ level: level1 });

      expect(logger.getConfig().level).toBe(level1);

      logger.configure({ level: level2 });

      expect(logger.getConfig().level).toBe(level2);

      logger.configure({ level: level3 });

      expect(logger.getConfig().level).toBe(level3);
    });
  });

  describe("callbackIgnoresLevel preservation", () => {
    test.prop([fc.boolean(), logLevelConfigArbitrary, callbackArbitrary], {
      numRuns: 5000,
    })(
      "callbackIgnoresLevel is preserved during partial updates",
      (initialFlag, newLevel, getCallback) => {
        const callback = getCallback();

        // Set initial value
        logger.configure({ callbackIgnoresLevel: initialFlag });

        expect(logger.getConfig().callbackIgnoresLevel).toBe(initialFlag);

        // Update level but not callbackIgnoresLevel
        logger.configure({ level: newLevel });

        expect(logger.getConfig().callbackIgnoresLevel).toBe(initialFlag);

        // Update callback but not callbackIgnoresLevel
        logger.configure({ callback });

        expect(logger.getConfig().callbackIgnoresLevel).toBe(initialFlag);
      },
    );
  });
});
