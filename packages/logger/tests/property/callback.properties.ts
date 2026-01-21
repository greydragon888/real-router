import { fc, test } from "@fast-check/vitest";
import { describe, beforeEach, afterEach, expect } from "vitest";

import { logger } from "logger";

import {
  callbackArbitrary,
  contextArbitrary,
  formatMessage,
  logArgsArbitrary,
  logLevelArbitrary,
  logLevelConfigArbitrary,
  messageArbitrary,
  shouldInvokeCallback,
  throwingCallbackArbitrary,
} from "./helpers";

const noop = () => {};

describe("Logger Callback Properties", () => {
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

  describe("Callback invocation with correct arguments", () => {
    test.prop(
      [
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        logArgsArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 1000 },
    )(
      "callback is always called with correct arguments",
      (messageLevel, context, message, args, getCallback) => {
        const callback = getCallback();

        logger.configure({ level: "all", callback });

        logger[messageLevel](context, message, ...args);

        // Callback should be called with correct arguments
        expect(callback).toHaveBeenCalledWith(
          messageLevel,
          context,
          message,
          ...args,
        );

        return true;
      },
    );
  });

  describe("callbackIgnoresLevel = false", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 1000 },
    )(
      "callback respects level filtering",
      (configLevel, messageLevel, context, message, getCallback) => {
        const callback = getCallback();

        logger.configure({
          level: configLevel,
          callback,
          callbackIgnoresLevel: false,
        });

        logger[messageLevel](context, message);

        const shouldInvoke = shouldInvokeCallback(
          messageLevel,
          configLevel,
          false,
        );

        if (shouldInvoke) {
          expect(callback).toHaveBeenCalledTimes(1);
        } else {
          expect(callback).not.toHaveBeenCalled();
        }

        return true;
      },
    );
  });

  describe("callbackIgnoresLevel = true", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 1000 },
    )(
      "callback receives all messages regardless of level",
      (configLevel, messageLevel, context, message, getCallback) => {
        const callback = getCallback();

        logger.configure({
          level: configLevel,
          callback,
          callbackIgnoresLevel: true,
        });

        logger[messageLevel](context, message);

        // Callback should be called regardless of level
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(messageLevel, context, message);

        return true;
      },
    );

    test.prop(
      [
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 500 },
    )(
      "callback receives messages even with level=none",
      (messageLevel, context, message, getCallback) => {
        const callback = getCallback();

        logger.configure({
          level: "none",
          callback,
          callbackIgnoresLevel: true,
        });

        logger[messageLevel](context, message);

        // Console should not be called
        expect(console[messageLevel]).not.toHaveBeenCalled();

        // But callback should be called
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(messageLevel, context, message);

        return true;
      },
    );
  });

  describe("Error handling in callback", () => {
    test.prop(
      [
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        throwingCallbackArbitrary,
      ],
      { numRuns: 500 },
    )(
      "error in callback does not stop logging",
      (messageLevel, context, message, getThrowingCallback) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        const throwingCallback = getThrowingCallback();

        logger.configure({
          level: "all",
          callback: throwingCallback,
        });

        // Logging should not throw error
        expect(() => {
          logger[messageLevel](context, message);
        }).not.toThrowError();

        // Console should be called (main logging works)
        if (messageLevel === "error") {
          // For error console.error is called twice: for message and for callback error
          expect(console.error).toHaveBeenCalledTimes(2);
          // First call - for message
          expect(console.error).toHaveBeenNthCalledWith(
            1,
            formatMessage(context, message),
          );
          // Second call - for callback error
          expect(console.error).toHaveBeenNthCalledWith(
            2,
            "[Logger] Error in callback:",
            expect.any(Error),
          );
        } else {
          // For log/warn the corresponding method is called once
          expect(console[messageLevel]).toHaveBeenCalledTimes(1);
          // console.error is called for callback error
          expect(console.error).toHaveBeenCalledWith(
            "[Logger] Error in callback:",
            expect.any(Error),
          );
        }

        return true;
      },
    );
  });

  describe("Consistency between callback and console", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 1000 },
    )(
      "with callbackIgnoresLevel=false callback and console work the same way",
      (configLevel, messageLevel, context, message, getCallback) => {
        // Reset state for this iteration
        vi.clearAllMocks();
        logger.configure({
          level: "all",
          callback: undefined,
          callbackIgnoresLevel: false,
        });

        const callback = getCallback();

        logger.configure({
          level: configLevel,
          callback,
          callbackIgnoresLevel: false,
        });

        logger[messageLevel](context, message);

        const consoleCallCount = vi.mocked(console[messageLevel]).mock.calls
          .length;
        const callbackCallCount = vi.mocked(callback).mock.calls.length;

        // Call counts should be the same
        expect(consoleCallCount).toBe(callbackCallCount);

        return true;
      },
    );
  });

  describe("Determinism of callback invocation", () => {
    test.prop(
      [
        logLevelConfigArbitrary,
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        fc.boolean(),
        callbackArbitrary,
      ],
      { numRuns: 1000 },
    )(
      "same parameters give same result",
      (
        configLevel,
        messageLevel,
        context,
        message,
        callbackIgnoresLevel,
        getCallback,
      ) => {
        const callback = getCallback();

        logger.configure({
          level: configLevel,
          callback,
          callbackIgnoresLevel,
        });

        // First call
        logger[messageLevel](context, message);
        const callCount1 = vi.mocked(callback).mock.calls.length;

        vi.clearAllMocks();

        // Second call with same parameters
        logger[messageLevel](context, message);
        const callCount2 = vi.mocked(callback).mock.calls.length;

        // Result should be the same
        expect(callCount1).toBe(callCount2);

        return true;
      },
    );
  });

  describe("Switching callbackIgnoresLevel", () => {
    test.prop(
      [
        logLevelArbitrary,
        contextArbitrary,
        messageArbitrary,
        callbackArbitrary,
      ],
      { numRuns: 500 },
    )(
      "changing callbackIgnoresLevel immediately affects behavior",
      (messageLevel, context, message, getCallback) => {
        const callback = getCallback();

        // First with level=none, callbackIgnoresLevel=false
        logger.configure({
          level: "none",
          callback,
          callbackIgnoresLevel: false,
        });

        logger[messageLevel](context, message);

        // Callback should not be called
        expect(callback).not.toHaveBeenCalled();

        vi.clearAllMocks();

        // Switch to callbackIgnoresLevel=true
        logger.configure({ callbackIgnoresLevel: true });

        logger[messageLevel](context, message);

        // Now callback should be called
        expect(callback).toHaveBeenCalledTimes(1);

        return true;
      },
    );
  });
});
