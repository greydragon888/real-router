import { test } from "@fast-check/vitest";
import { describe, beforeEach, afterEach, expect } from "vitest";

import { logger } from "@real-router/logger";

import {
  contextArbitrary,
  formatMessage,
  logArgsArbitrary,
  logLevelArbitrary,
  logLevelConfigArbitrary,
  messageArbitrary,
  shouldFilterMessage,
} from "./helpers";

const noop = () => {};

describe("Logger Level Filtering Properties", () => {
  beforeEach(() => {
    // Mock console methods
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);

    // Reset logger to default state
    logger.configure({
      level: "all",
      callback: undefined,
      callbackIgnoresLevel: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Reset logger state
    logger.configure({
      level: "all",
      callback: undefined,
      callbackIgnoresLevel: false,
    });
  });

  describe("Filtering determinism", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
      ],
      { numRuns: 10_000 },
    )(
      "same levels give same filtering result",
      (configLevel, messageLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: configLevel });

        // Call twice with same parameters
        logger[messageLevel](context, message);
        const callCount1 = vi.mocked(console[messageLevel]).mock.calls.length;

        vi.clearAllMocks();

        logger[messageLevel](context, message);
        const callCount2 = vi.mocked(console[messageLevel]).mock.calls.length;

        // Result should be the same
        expect(callCount1).toBe(callCount2);

        return true;
      },
    );
  });

  describe("Filtering monotonicity", () => {
    test.prop([logLevelArbitrary, contextArbitrary, messageArbitrary], {
      numRuns: 5000,
    })("level none filters all messages", (messageLevel, context, message) => {
      // Reset state for this iteration
      vi.clearAllMocks();
      logger.configure({
        level: "all",
        callback: undefined,
        callbackIgnoresLevel: false,
      });

      logger.configure({ level: "none" });

      logger[messageLevel](context, message);

      // No console method should be called
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();

      return true;
    });

    test.prop([logLevelArbitrary, contextArbitrary, messageArbitrary], {
      numRuns: 5000,
    })(
      "level all does not filter messages",
      (messageLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: "all" });

        logger[messageLevel](context, message);

        // Corresponding console method should be called
        expect(console[messageLevel]).toHaveBeenCalledTimes(1);

        return true;
      },
    );
  });

  describe("Filtering correctness", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        logArgsArbitrary,
      ],
      { numRuns: 10_000 },
    )(
      "filtering matches specification",
      (configLevel, messageLevel, context, message, args) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: configLevel });

        logger[messageLevel](context, message, ...args);

        const shouldFilter = shouldFilterMessage(messageLevel, configLevel);

        if (shouldFilter) {
          // Message should be filtered
          expect(console[messageLevel]).not.toHaveBeenCalled();
        } else {
          // Message should not be filtered
          expect(console[messageLevel]).toHaveBeenCalledTimes(1);
        }

        return true;
      },
    );
  });

  describe("Message formatting", () => {
    test.prop(
      [logLevelArbitrary, contextArbitrary, messageArbitrary, logArgsArbitrary],
      { numRuns: 10_000 },
    )(
      "messages are always formatted with context correctly",
      (messageLevel, context, message, args) => {
        // Use level=all to ensure message passes
        logger.configure({ level: "all" });

        logger[messageLevel](context, message, ...args);

        // Check formatting
        const expectedMessage = formatMessage(context, message);

        expect(console[messageLevel]).toHaveBeenCalledWith(
          expectedMessage,
          ...args,
        );

        return true;
      },
    );
  });

  describe("Argument passing", () => {
    test.prop(
      [logLevelArbitrary, contextArbitrary, messageArbitrary, logArgsArbitrary],
      { numRuns: 10_000 },
    )(
      "additional arguments are passed to console correctly",
      (messageLevel, context, message, args) => {
        logger.configure({ level: "all" });

        logger[messageLevel](context, message, ...args);

        const expectedMessage = formatMessage(context, message);

        // Check that all arguments are passed
        expect(console[messageLevel]).toHaveBeenCalledWith(
          expectedMessage,
          ...args,
        );

        return true;
      },
    );
  });

  describe("Level hierarchy", () => {
    test.prop([logLevelConfigArbitrary, contextArbitrary, messageArbitrary], {
      numRuns: 5000,
    })(
      "error passes on all levels except none",
      (configLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: configLevel });

        logger.error(context, message);

        if (configLevel === "none") {
          expect(console.error).not.toHaveBeenCalled();
        } else {
          expect(console.error).toHaveBeenCalledTimes(1);
        }

        return true;
      },
    );

    test.prop([logLevelConfigArbitrary, contextArbitrary, messageArbitrary], {
      numRuns: 5000,
    })(
      "warn is filtered on error-only and none levels",
      (configLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: configLevel });

        logger.warn(context, message);

        if (configLevel === "error-only" || configLevel === "none") {
          expect(console.warn).not.toHaveBeenCalled();
        } else {
          expect(console.warn).toHaveBeenCalledTimes(1);
        }

        return true;
      },
    );

    test.prop([logLevelConfigArbitrary, contextArbitrary, messageArbitrary], {
      numRuns: 5000,
    })(
      "log is filtered on all levels except all",
      (configLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        logger.configure({ level: configLevel });

        logger.log(context, message);

        if (configLevel === "all") {
          expect(console.log).toHaveBeenCalledTimes(1);
        } else {
          expect(console.log).not.toHaveBeenCalled();
        }

        return true;
      },
    );
  });

  describe("Level switching", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
      ],
      { numRuns: 10_000 },
    )(
      "changing level immediately affects filtering",
      (level1, level2, messageLevel, context, message) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        // Set first level
        logger.configure({ level: level1 });
        logger[messageLevel](context, message);

        const shouldFilter1 = shouldFilterMessage(messageLevel, level1);
        const callCount1 = vi.mocked(console[messageLevel]).mock.calls.length;

        if (shouldFilter1) {
          expect(callCount1).toBe(0);
        } else {
          expect(callCount1).toBe(1);
        }

        vi.clearAllMocks();

        // Switch to second level
        logger.configure({ level: level2 });
        logger[messageLevel](context, message);

        const shouldFilter2 = shouldFilterMessage(messageLevel, level2);
        const callCount2 = vi.mocked(console[messageLevel]).mock.calls.length;

        if (shouldFilter2) {
          expect(callCount2).toBe(0);
        } else {
          expect(callCount2).toBe(1);
        }

        return true;
      },
    );
  });
});
