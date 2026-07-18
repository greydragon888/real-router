import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  LEVEL_CONFIGS,
  LOG_LEVELS,
} from "../../../../src/foundation/logger/constants";
import { RouterLogger } from "../../../../src/foundation/logger/RouterLogger";

import type {
  LogCallback,
  LoggerConfig,
  LogLevelConfig,
} from "@real-router/types";

// Per-router logger instance under test — the standalone `@real-router/logger`
// singleton was dissolved into core (`foundation/logger`). A fresh instance is
// created in the "Logger" describe's beforeEach (replaces the singleton reset).
let logger: RouterLogger;

const noop = () => {};

const throwingCallback: LogCallback = () => {
  throw new Error("Callback error");
};

const TEST_MESSAGE = "test message";
const WARNING_MESSAGE = "warning message";
const ERROR_MESSAGE = "error message";
const WARN_ERROR = "warn-error";
const ERROR_ONLY = "error-only";

describe("exported constants (LEVEL_CONFIGS / LOG_LEVELS)", () => {
  // These constants back the process-global threshold logic
  // (`#currentThreshold = LEVEL_CONFIGS[level]`); if mutable, any code in the
  // process could corrupt log filtering for everyone, including core (#897).
  it("freezes LEVEL_CONFIGS so it cannot be mutated", () => {
    expect(Object.isFrozen(LEVEL_CONFIGS)).toBe(true);
  });

  it("freezes LOG_LEVELS so it cannot be mutated", () => {
    expect(Object.isFrozen(LOG_LEVELS)).toBe(true);
  });
});

describe("fresh instance default (before any configure())", () => {
  // The #config initializer sets `callbackIgnoresLevel: false`. The main Logger
  // suite's beforeEach overwrites it on every test, masking the initializer
  // default — so assert it HERE, on a pristine instance that has had no
  // configure() called. A `true` initializer mutant flips this default.
  it("defaults callbackIgnoresLevel to false on a fresh RouterLogger", () => {
    expect(new RouterLogger().getConfig().callbackIgnoresLevel).toBe(false);
  });
});

describe("Logger", () => {
  beforeEach(() => {
    // Mock console methods
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);

    // Fresh per-router logger instance per test (defaults: level "all",
    // callback undefined, callbackIgnoresLevel false) — replaces the former
    // singleton reset.
    logger = new RouterLogger();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("configure", () => {
    it("should update log level", () => {
      logger.configure({ level: ERROR_ONLY });
      const config = logger.getConfig();

      expect(config.level).toBe(ERROR_ONLY);
    });

    it("should update callback", () => {
      const callback: LogCallback = vi.fn();

      logger.configure({ callback });
      const config = logger.getConfig();

      expect(config.callback).toBe(callback);
    });

    it("should update both level and callback", () => {
      const callback: LogCallback = vi.fn();

      logger.configure({ level: WARN_ERROR, callback });
      const config = logger.getConfig();

      expect(config.level).toBe(WARN_ERROR);
      expect(config.callback).toBe(callback);
    });

    it("should handle partial updates", () => {
      const callback: LogCallback = vi.fn();

      logger.configure({ callback });
      logger.configure({ level: WARN_ERROR });

      const config = logger.getConfig();

      expect(config.level).toBe(WARN_ERROR);
      expect(config.callback).toBe(callback);
    });

    it("should handle empty config object", () => {
      const initialConfig = logger.getConfig();

      logger.configure({});
      const newConfig = logger.getConfig();

      expect(newConfig).toStrictEqual(initialConfig);
    });

    it("should clear callback when setting undefined", () => {
      const callback: LogCallback = vi.fn();

      logger.configure({ callback });
      logger.configure({ callback: undefined });

      const config = logger.getConfig();

      expect(config.callback).toBeUndefined();
    });

    it("should ignore a callback inherited from the prototype (own-property only)", () => {
      const callback: LogCallback = vi.fn();
      // `callback` lives on the prototype, not as an own enumerable property.
      const inherited = Object.create({ callback }) as Partial<LoggerConfig>;

      logger.configure(inherited);

      const config = logger.getConfig();

      expect(config.callback).toBeUndefined();
    });

    it("should accept none level", () => {
      logger.configure({ level: "none" });
      const config = logger.getConfig();

      expect(config.level).toBe("none");
    });

    it("should update callbackIgnoresLevel", () => {
      logger.configure({ callbackIgnoresLevel: true });
      const config = logger.getConfig();

      expect(config.callbackIgnoresLevel).toBe(true);
    });

    it("should handle callbackIgnoresLevel with other options", () => {
      const callback = vi.fn();

      logger.configure({
        level: ERROR_ONLY,
        callback,
        callbackIgnoresLevel: true,
      });
      const config = logger.getConfig();

      expect(config.level).toBe(ERROR_ONLY);
      expect(config.callback).toBe(callback);
      expect(config.callbackIgnoresLevel).toBe(true);
    });

    it("should preserve callbackIgnoresLevel on partial updates", () => {
      logger.configure({ callbackIgnoresLevel: true });
      logger.configure({ level: "none" });

      const config = logger.getConfig();

      expect(config.callbackIgnoresLevel).toBe(true);
    });

    it("should throw error for invalid log level", () => {
      expect(() => {
        logger.configure({ level: "invalid" as LogLevelConfig });
      }).toThrow(
        'Invalid log level: "invalid". Valid levels are: all, warn-error, error-only, none',
      );
    });

    it("should throw error with correct message format for invalid level", () => {
      expect(() => {
        logger.configure({ level: "debug" as LogLevelConfig });
      }).toThrow(/Invalid log level:.*Valid levels are:/);
    });

    it("should reject Object.prototype keys as level (own-property validation)", () => {
      // "toString" (and other Object.prototype keys) is inherited on every
      // object, so a prototype-aware `in` check would accept it as a valid level
      // and store it. Validation must use own-property semantics (#895).
      expect(() => {
        logger.configure({ level: "toString" as LogLevelConfig });
      }).toThrow(/Invalid log level/);
    });

    it("reads config.level once — immune to an unstable getter TOCTOU (#1162)", () => {
      // A well-typed getter (returns LogLevelConfig) that changes value between
      // reads passed validation with a valid level, then the code stored a later
      // unvalidated one — disabling the threshold filter. Read-once closes it.
      let reads = 0;
      const evil: Partial<LoggerConfig> = {
        get level(): LogLevelConfig {
          reads++;

          return reads <= 2 ? ERROR_ONLY : ("toString" as LogLevelConfig);
        },
      };

      logger.configure(evil);

      // The validated "error-only" is stored (not a later "toString")…
      expect(logger.getConfig().level).toBe(ERROR_ONLY);

      // …and the threshold filter stays valid: a "toString" level → NaN threshold
      // would disable it, letting a filtered "log" message through.
      logger.log("Probe", "x");

      expect(console.log).not.toHaveBeenCalled();
    });

    it("should verify default callbackIgnoresLevel is false in internal config", () => {
      // Reset to defaults to verify internal state
      logger.configure({
        level: "all",
        callback: undefined,
        callbackIgnoresLevel: false,
      });

      // Don't set callbackIgnoresLevel explicitly - verify it defaults to false
      logger.configure({ level: "warn-error" });

      const config = logger.getConfig();

      expect(config.callbackIgnoresLevel).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should return current configuration", () => {
      const config = logger.getConfig();

      expect(config).toHaveProperty("level");
      expect(config).toHaveProperty("callback");
    });

    it("should return default configuration initially", () => {
      const config = logger.getConfig();

      expect(config.level).toBe("all");
      expect(config.callback).toBeUndefined();
    });

    it("should return copy of configuration (not reference)", () => {
      const config1 = logger.getConfig();
      const config2 = logger.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toStrictEqual(config2);
    });

    it("should return callbackIgnoresLevel in configuration", () => {
      const config = logger.getConfig();

      expect(config).toHaveProperty("callbackIgnoresLevel");
    });

    it("should return default callbackIgnoresLevel as false", () => {
      const config = logger.getConfig();

      expect(config.callbackIgnoresLevel).toBe(false);
    });
  });

  describe("log", () => {
    it("should call console.log with formatted message", () => {
      logger.log("Router", "test message");

      expect(console.log).toHaveBeenCalledWith("[Router] test message");
    });

    it("should pass additional arguments to console", () => {
      const data = { id: 1 };
      const error = new Error("test");

      logger.log("Router", "test message", data, error);

      expect(console.log).toHaveBeenCalledWith(
        "[Router] test message",
        data,
        error,
      );
    });

    it("should handle empty context", () => {
      logger.log("", TEST_MESSAGE);

      expect(console.log).toHaveBeenCalledWith(TEST_MESSAGE);
    });

    it("should not be called when level is warn-error", () => {
      logger.configure({ level: WARN_ERROR });
      logger.log("Router", TEST_MESSAGE);

      expect(console.log).not.toHaveBeenCalled();
    });

    it("should not be called when level is error-only", () => {
      logger.configure({ level: ERROR_ONLY });
      logger.log("Router", TEST_MESSAGE);

      expect(console.log).not.toHaveBeenCalled();
    });

    it("should call callback when configured", () => {
      const callback = vi.fn();

      logger.configure({ callback });
      logger.log("Router", TEST_MESSAGE, "extra");

      expect(callback).toHaveBeenCalledWith(
        "log",
        "Router",
        TEST_MESSAGE,
        "extra",
      );
    });

    it("should not call callback when level filters out the message", () => {
      const callback = vi.fn();

      logger.configure({ level: ERROR_ONLY, callback });
      logger.log("Router", TEST_MESSAGE);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not be called when level is none", () => {
      logger.configure({ level: "none" });
      logger.log("Router", TEST_MESSAGE);

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("warn", () => {
    it("should call console.warn with formatted message", () => {
      logger.warn("Router", WARNING_MESSAGE);

      expect(console.warn).toHaveBeenCalledWith("[Router] warning message");
    });

    it("should pass additional arguments to console", () => {
      const data = { count: 51 };

      logger.warn("router.usePlugin", "Too many plugins", data);

      expect(console.warn).toHaveBeenCalledWith(
        "[router.usePlugin] Too many plugins",
        data,
      );
    });

    it("should handle empty context", () => {
      logger.warn("", "Warning message");

      expect(console.warn).toHaveBeenCalledWith("Warning message");
    });

    it("should be called when level is warn-error", () => {
      logger.configure({ level: WARN_ERROR });
      logger.warn("Router", "Warning message");

      expect(console.warn).toHaveBeenCalledWith("[Router] Warning message");
    });

    it("should not be called when level is error-only", () => {
      logger.configure({ level: ERROR_ONLY });
      logger.warn("Router", "Warning message");

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should call callback when configured", () => {
      const callback = vi.fn();

      logger.configure({ callback });
      logger.warn("Router.Transition", "Deprecated method", 123);

      expect(callback).toHaveBeenCalledWith(
        "warn",
        "Router.Transition",
        "Deprecated method",
        123,
      );
    });

    it("should not be called when level is none", () => {
      logger.configure({ level: "none" });
      logger.warn("Router", WARNING_MESSAGE);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    it("should call console.error with formatted message", () => {
      logger.error("Router", ERROR_MESSAGE);

      expect(console.error).toHaveBeenCalledWith("[Router] error message");
    });

    it("should pass additional arguments to console", () => {
      const err = new Error("Navigation failed");

      logger.error("Router.Navigation", "Failed to navigate", err);

      expect(console.error).toHaveBeenCalledWith(
        "[Router.Navigation] Failed to navigate",
        err,
      );
    });

    it("should handle empty context", () => {
      logger.error("", ERROR_MESSAGE);

      expect(console.error).toHaveBeenCalledWith(ERROR_MESSAGE);
    });

    it("should be called when level is all", () => {
      logger.configure({ level: "all" });
      logger.error("Router", ERROR_MESSAGE);

      expect(console.error).toHaveBeenCalledWith("[Router] error message");
    });

    it("should be called when level is warn-error", () => {
      logger.configure({ level: WARN_ERROR });
      logger.error("Router", ERROR_MESSAGE);

      expect(console.error).toHaveBeenCalledWith("[Router] error message");
    });

    it("should be called when level is error-only", () => {
      logger.configure({ level: ERROR_ONLY });
      logger.error("Router", ERROR_MESSAGE);

      expect(console.error).toHaveBeenCalledWith("[Router] error message");
    });

    it("should call callback when configured", () => {
      const callback = vi.fn();

      logger.configure({ callback });
      const error = new Error("test");

      logger.error("Router.Critical", "System failure", error);

      expect(callback).toHaveBeenCalledWith(
        "error",
        "Router.Critical",
        "System failure",
        error,
      );
    });

    it("should not be called when level is none", () => {
      logger.configure({ level: "none" });
      logger.error("Router", ERROR_MESSAGE);

      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("callback error handling", () => {
    it("should not throw when callback throws", () => {
      logger.configure({ callback: throwingCallback });

      expect(() => {
        logger.error("Router", "Test");
      }).not.toThrow();
    });

    it("should log callback errors to console.error", () => {
      const throwingCallback: LogCallback = () => {
        throw new Error("Callback error");
      };

      logger.configure({ callback: throwingCallback });

      logger.error("Router", "Test");

      // First call is the actual log, second is the callback error
      expect(console.error).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenNthCalledWith(1, "[Router] Test");
      expect(console.error).toHaveBeenNthCalledWith(
        2,
        "[Logger] Error in callback:",
        expect.any(Error),
      );
    });

    it("should still log message even if callback throws", () => {
      logger.configure({ callback: throwingCallback });

      logger.warn("Router", "Warning");

      expect(console.warn).toHaveBeenCalledWith("[Router] Warning");
    });

    it("isolates an async callback rejection instead of leaking a Node unhandledRejection (#1161)", async () => {
      // An async callback (`(...) => Promise<void>` is assignable to the void-typed
      // LogCallback) returns a Promise; before the fix its rejection was discarded
      // and surfaced as a Node `unhandledRejection` — process-fatal under
      // `--unhandled-rejections=strict` (Node 22+ default). It must be isolated
      // into console.error like core's subscribe (#944 → #1161).
      const leaked: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        leaked.push(reason);
      };

      process.on("unhandledRejection", onUnhandled);

      try {
        logger.configure({
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- #1161: a Promise-returning callback IS assignable to the void-typed LogCallback; that assignability is exactly the misuse under test
          callback: () => Promise.reject(new Error("async boom")),
        });

        expect(() => {
          logger.error("Router", "Test");
        }).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(console.error).toHaveBeenCalledWith(
          "[Logger] Error in async callback:",
          expect.any(Error),
        );
        expect(leaked).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });

  describe("console fallback", () => {
    it("should handle missing console object", () => {
      const originalConsole = globalThis.console;

      // @ts-expect-error - Testing runtime behavior
      delete globalThis.console;

      expect(() => {
        logger.error("Router", "Test");
      }).not.toThrow();

      globalThis.console = originalConsole;
    });

    it("should handle missing console method", () => {
      const originalWarn = console.warn;

      // @ts-expect-error - Testing runtime behavior
      delete console.warn;

      expect(() => {
        logger.warn("Router", "Test");
      }).not.toThrow();

      console.warn = originalWarn;
    });

    it("should handle non-function console method", () => {
      const originalLog = console.log;

      // @ts-expect-error - Testing runtime behavior
      console.log = "not a function";

      expect(() => {
        logger.log("Router", "Test");
      }).not.toThrow();

      console.log = originalLog;
    });

    it("should handle missing console for callback errors", () => {
      const originalConsole = globalThis.console;

      logger.configure({ callback: throwingCallback });

      // @ts-expect-error - Testing runtime behavior
      delete globalThis.console;

      expect(() => {
        logger.error("Router", "Test");
      }).not.toThrow();

      globalThis.console = originalConsole;
    });

    it("should handle non-function console.error for callback errors", () => {
      const originalError = console.error;

      logger.configure({ callback: throwingCallback });

      // @ts-expect-error - Testing runtime behavior
      console.error = "not a function";

      expect(() => {
        logger.log("Router", "Test");
      }).not.toThrow();

      console.error = originalError;
    });
  });

  describe("level filtering", () => {
    describe("level: all", () => {
      beforeEach(() => {
        logger.configure({ level: "all" });
      });

      it("should output all levels", () => {
        logger.log("Test", "log");
        logger.warn("Test", "warn");
        logger.error("Test", "error");

        expect(console.log).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledTimes(1);
      });
    });

    describe("level: warn-error", () => {
      beforeEach(() => {
        logger.configure({ level: WARN_ERROR });
      });

      it("should output only warn and error", () => {
        logger.log("Test", "log");
        logger.warn("Test", "warn");
        logger.error("Test", "error");

        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledTimes(1);
      });
    });

    describe("level: error-only", () => {
      beforeEach(() => {
        logger.configure({ level: ERROR_ONLY });
      });

      it("should output only error", () => {
        logger.log("Test", "log");
        logger.warn("Test", "warn");
        logger.error("Test", "error");

        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledTimes(1);
      });
    });

    describe("level: none", () => {
      beforeEach(() => {
        logger.configure({ level: "none" });
      });

      it("should not output any level", () => {
        logger.log("Test", "log");
        logger.warn("Test", "warn");
        logger.error("Test", "error");

        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
      });

      it("should not call callback for any level", () => {
        const callback = vi.fn();

        logger.configure({ level: "none", callback });

        logger.log("Test", "log");
        logger.warn("Test", "warn");
        logger.error("Test", "error");

        expect(callback).not.toHaveBeenCalled();
      });

      it("should trigger early return in #writeLog when level is none", () => {
        const callback = vi.fn();

        // This specifically tests the early return at line 183-185
        // if (this.#config.level === "none" && !this.#config.callbackIgnoresLevel) { return; }
        logger.configure({
          level: "none",
          callback,
          callbackIgnoresLevel: false,
        });

        logger.log("Test", "message");

        // Both console and callback should be skipped due to early return
        expect(console.log).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
      });
    });
  });

  describe("context formatting", () => {
    it("should format various context styles correctly", () => {
      logger.log("Router", "message");

      expect(console.log).toHaveBeenCalledWith("[Router] message");

      logger.log("router.usePlugin", "message");

      expect(console.log).toHaveBeenCalledWith("[router.usePlugin] message");

      logger.log("Router.Transition", "message");

      expect(console.log).toHaveBeenCalledWith("[Router.Transition] message");

      logger.log("router.addDependency", "message");

      expect(console.log).toHaveBeenCalledWith(
        "[router.addDependency] message",
      );
    });

    it("should handle special characters in context", () => {
      logger.log("Router:Core", "message");

      expect(console.log).toHaveBeenCalledWith("[Router:Core] message");

      logger.log("router/navigation", "message");

      expect(console.log).toHaveBeenCalledWith("[router/navigation] message");

      logger.log("router_lifecycle", "message");

      expect(console.log).toHaveBeenCalledWith("[router_lifecycle] message");
    });
  });

  describe("callbackIgnoresLevel behavior", () => {
    it("should call callback even when level filters out message if callbackIgnoresLevel is true", () => {
      const callback = vi.fn();

      logger.configure({
        level: ERROR_ONLY,
        callback,
        callbackIgnoresLevel: true,
      });

      logger.log("Test", "log message");
      logger.warn("Test", "warn message");

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith("log", "Test", "log message");
      expect(callback).toHaveBeenCalledWith("warn", "Test", "warn message");
    });

    it("should respect level when callbackIgnoresLevel is false", () => {
      const callback = vi.fn();

      logger.configure({
        level: ERROR_ONLY,
        callback,
        callbackIgnoresLevel: false, // явно false
      });

      logger.log("Test", "message");

      expect(callback).not.toHaveBeenCalled();
    });

    it("should respect level when callbackIgnoresLevel is undefined (default)", () => {
      const callback = vi.fn();

      logger.configure({
        level: WARN_ERROR,
        callback,
        // callbackIgnoresLevel не указан
      });

      logger.log("Test", "log");
      logger.warn("Test", "warn");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("warn", "Test", "warn");
    });

    it("should call callback for all messages with level none when callbackIgnoresLevel is true", () => {
      const callback = vi.fn();

      logger.configure({
        level: "none",
        callback,
        callbackIgnoresLevel: true,
      });

      logger.log("Test", "log");
      logger.warn("Test", "warn");
      logger.error("Test", "error");

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith("log", "Test", "log");
      expect(callback).toHaveBeenCalledWith("warn", "Test", "warn");
      expect(callback).toHaveBeenCalledWith("error", "Test", "error");
    });

    it("should handle callback errors even when callbackIgnoresLevel is true", () => {
      logger.configure({
        level: "none",
        callback: throwingCallback,
        callbackIgnoresLevel: true,
      });

      expect(() => {
        logger.error("Test", "message");
      }).not.toThrow();
    });

    it("should dynamically switch callbackIgnoresLevel behavior", () => {
      const callback = vi.fn();

      // Сначала с callbackIgnoresLevel = false
      logger.configure({
        level: ERROR_ONLY,
        callback,
        callbackIgnoresLevel: false,
      });

      logger.log("Test", "should not trigger callback");

      expect(callback).not.toHaveBeenCalled();

      // Переключаем на true
      logger.configure({ callbackIgnoresLevel: true });

      logger.log("Test", "should trigger callback");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        "log",
        "Test",
        "should trigger callback",
      );
    });
  });

  describe("instance state behavior", () => {
    it("should maintain configuration across reads on the same instance", () => {
      const callback = vi.fn();

      logger.configure({ level: ERROR_ONLY, callback });

      // A later read on the same per-router instance sees the config
      const config = logger.getConfig();

      expect(config.level).toBe(ERROR_ONLY);
      expect(config.callback).toBe(callback);
    });

    it("should share state between all references", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      logger.configure({ callback: callback1 });
      const config1 = logger.getConfig();

      expect(config1.callback).toBe(callback1);

      // Simulate another part of app changing config
      logger.configure({ callback: callback2 });
      const config2 = logger.getConfig();

      expect(config2.callback).toBe(callback2);
      expect(config2.callback).not.toBe(callback1);
    });
  });

  describe("callback async error handling", () => {
    it("should fire-and-forget when callback returns rejected Promise", () => {
      const asyncCallback: LogCallback = vi
        .fn()
        .mockRejectedValue(new Error("async boom"));

      logger.configure({ callback: asyncCallback });

      // Should not throw — rejected promise is fire-and-forget
      expect(() => {
        logger.log("Router", "test");
      }).not.toThrow();

      expect(asyncCallback).toHaveBeenCalled();
      // Console should still receive the message
      expect(console.log).toHaveBeenCalledWith("[Router] test");
    });
  });

  describe("re-entrant callback (issue #791)", () => {
    it("should invoke the callback only once when it re-enters the logger", () => {
      let callCount = 0;

      // A callback that re-enters the logger on the happy path (no self-bound).
      // Without a re-entrancy guard this recurses ~5.9k deep until a swallowed
      // RangeError, invoking the callback thousands of times.
      const reentrantCallback: LogCallback = () => {
        callCount++;
        logger.error("Inner", "from callback");
      };

      logger.configure({ callback: reentrantCallback });
      logger.error("Outer", "kick");

      // The nested logger.error must NOT re-invoke the callback (safe no-op).
      expect(callCount).toBe(1);
    });

    it("should preserve nested console output without flooding it", () => {
      const reentrantCallback: LogCallback = () => {
        logger.error("Inner", "from callback");
      };

      logger.configure({ callback: reentrantCallback });
      logger.error("Outer", "kick");

      // Outer message + the single nested message — not ~5.9k console.error.
      expect(console.error).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenNthCalledWith(1, "[Outer] kick");
      expect(console.error).toHaveBeenNthCalledWith(2, "[Inner] from callback");
    });
  });

  describe("non-string context and message", () => {
    it("should handle number as context", () => {
      // @ts-expect-error — testing runtime behavior with non-string
      logger.log(42, "message");

      expect(console.log).toHaveBeenCalledWith("[42] message");
    });

    it("should handle null as context", () => {
      // @ts-expect-error — testing runtime behavior with null
      logger.log(null, "message");

      // null is falsy, so empty context path
      expect(console.log).toHaveBeenCalledWith("message");
    });

    it("should handle undefined as context", () => {
      // @ts-expect-error — testing runtime behavior with undefined
      logger.log(undefined, "message");

      // undefined is falsy, so empty context path
      expect(console.log).toHaveBeenCalledWith("message");
    });

    it("should handle number as message", () => {
      // @ts-expect-error — testing runtime behavior with non-string
      logger.log("Router", 123);

      expect(console.log).toHaveBeenCalledWith("[Router] 123");
    });

    it("should forward non-string values through callback", () => {
      const callback = vi.fn();

      logger.configure({ callback });

      // @ts-expect-error — testing runtime behavior with non-string
      logger.log(42, 123);

      expect(callback).toHaveBeenCalledWith("log", 42, 123);
    });
  });

  describe("switching between levels", () => {
    it("should correctly switch from none to other levels", () => {
      const callback = vi.fn();

      logger.configure({ level: "none", callback });

      logger.error("Test", "Should not appear");

      expect(console.error).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();

      logger.configure({ level: ERROR_ONLY });

      logger.error("Test", "Should appear");

      expect(console.error).toHaveBeenCalledWith("[Test] Should appear");
      expect(callback).toHaveBeenCalledWith("error", "Test", "Should appear");
    });

    it("should correctly switch from other levels to none", () => {
      logger.configure({ level: "all" });

      logger.log("Test", "Should appear");

      expect(console.log).toHaveBeenCalledWith("[Test] Should appear");

      logger.configure({ level: "none" });
      vi.clearAllMocks();

      logger.log("Test", "Should not appear");
      logger.warn("Test", "Should not appear");
      logger.error("Test", "Should not appear");

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
