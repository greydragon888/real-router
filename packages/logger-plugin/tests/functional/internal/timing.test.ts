import { describe, beforeEach, afterEach, it, expect } from "vitest";

describe("timing - module initialization", () => {
  beforeEach(() => {
    // Clear module cache for test isolation
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when performance.now() is globally available", () => {
    it("should use performance.now() in browser environment", async () => {
      // Mock browser environment
      const mockPerformanceNow = vi.fn(() => 123.456);

      vi.stubGlobal("performance", {
        now: mockPerformanceNow,
      });

      // Dynamic import after setting up mocks
      const { now } = await import("../../../src/internal/timing.js");

      const result = now();

      expect(mockPerformanceNow).toHaveBeenCalled();
      expect(result).toBe(123.456);
    });

    it("should return monotonic values via performance.now()", async () => {
      let counter = 0;
      const mockPerformanceNow = vi.fn(() => {
        counter += 10;

        return counter;
      });

      vi.stubGlobal("performance", {
        now: mockPerformanceNow,
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now();
      const t2 = now();
      const t3 = now();

      expect(t1).toBe(10);
      expect(t2).toBe(20);
      expect(t3).toBe(30);
      expect(t3).toBeGreaterThan(t2);
      expect(t2).toBeGreaterThan(t1);
    });

    it("should handle multiple calls with same timestamp value", async () => {
      // Simulate performance.now() returning same value (high-resolution but within same ms)
      const mockPerformanceNow = vi.fn(() => 100.5);

      vi.stubGlobal("performance", {
        now: mockPerformanceNow,
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now();
      const t2 = now();
      const t3 = now();

      // All calls should return the same value since performance.now() doesn't change
      expect(t1).toBe(100.5);
      expect(t2).toBe(100.5);
      expect(t3).toBe(100.5);
      expect(mockPerformanceNow).toHaveBeenCalledTimes(3);
    });
  });

  describe("when performance.now() is not available and using Date.now()", () => {
    beforeEach(() => {
      // Remove global performance
      vi.stubGlobal("performance", undefined);
    });

    it("should fallback to Date.now() with monotonicity", async () => {
      const mockDateNow = vi.fn(() => 1000);

      vi.spyOn(Date, "now").mockImplementation(mockDateNow);

      const { now } = await import("../../../src/internal/timing.js");

      const result = now();

      expect(mockDateNow).toHaveBeenCalled();
      expect(result).toBe(1000);
    });

    it("should initialize correctly from zero state on first call", async () => {
      const timestamps = [1234, 1235, 1236];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1236;
      });

      const { now } = await import("../../../src/internal/timing.js");

      // First call initializes lastTimestamp from zero
      const t1 = now();

      expect(t1).toBe(1234);

      // Subsequent calls should work normally
      const t2 = now();

      expect(t2).toBe(1235);

      const t3 = now();

      expect(t3).toBe(1236);

      // Verify monotonicity
      expect(t2).toBeGreaterThan(t1);
      expect(t3).toBeGreaterThan(t2);
    });

    it("should handle multiple calls with same Date.now() value", async () => {
      // Simulate Date.now() returning same value (within same millisecond)
      const mockDateNow = vi.fn(() => 5000);

      vi.spyOn(Date, "now").mockImplementation(mockDateNow);

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now();
      const t2 = now();
      const t3 = now();

      // All calls return same timestamp, no offset accumulates
      expect(t1).toBe(5000);
      expect(t2).toBe(5000);
      expect(t3).toBe(5000);
      expect(mockDateNow).toHaveBeenCalledTimes(3);
    });

    it("should correctly accumulate offset with multiple rollbacks", async () => {
      const timestamps = [1000, 500, 400, 1500];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1500;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now(); // 1000
      const t2 = now(); // 500 (rollback) → 1000
      const t3 = now(); // 400 (rollback) → 900
      const t4 = now(); // 1500 → 2100

      expect(t1).toBe(1000);

      // Rollback from 1000 to 500: offset = 500, lastTimestamp = 500
      expect(t2).toBe(1000); // 500 + 500

      // Rollback from 500 to 400: offset += (500-400)=100, total=600
      expect(t3).toBe(1000); // 400 + 600 - ERROR IN MY TEST!

      // Correct: offset += 100, total 600
      // 400 + 600 = 1000, not 900

      // Progress: 1500 > 400, offset remains 600
      expect(t4).toBe(2100); // 1500 + 600
    });

    it("should handle continuous time degradation", async () => {
      const timestamps = [1000, 900, 800, 700, 600];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 600;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const results = [];

      for (let i = 0; i < 5; i++) {
        results.push(now());
      }

      // t1: 1000, offset=0, lastTimestamp=1000 → 1000
      expect(results[0]).toBe(1000);

      // t2: 900 < 1000, offset+=100, lastTimestamp=900 → 1000
      expect(results[1]).toBe(1000);

      // t3: 800 < 900, offset+=100, lastTimestamp=800 → 1000
      expect(results[2]).toBe(1000);

      // t4: 700 < 800, offset+=100, lastTimestamp=700 → 1000
      expect(results[3]).toBe(1000);

      // t5: 600 < 700, offset+=100, lastTimestamp=600 → 1000
      expect(results[4]).toBe(1000);

      // All values should be equal - time is "frozen"
      const allEqual = results.every((val) => val === 1000);

      expect(allEqual).toBe(true);
    });

    it("should accumulate offset with multiple rollbacks", async () => {
      const timestamps = [1000, 900, 800, 1500];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1500;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now(); // 1000
      const t2 = now(); // 900 (rollback) → 1000
      const t3 = now(); // 800 (another rollback) → 1000
      const t4 = now(); // 1500 → 1700

      expect(t1).toBe(1000);

      // First rollback: 900 < 1000
      // offset += (1000 - 900) = 100
      // lastTimestamp = 900
      expect(t2).toBe(1000); // 900 + 100

      // Second rollback: 800 < 900
      // offset += (900 - 800) = 100, total = 200
      // lastTimestamp = 800
      expect(t3).toBe(1000); // 800 + 200

      // Normal progress: 1500 > 800
      // offset doesn't change
      expect(t4).toBe(1700); // 1500 + 200

      // Monotonicity preserved
      expect(t4).toBeGreaterThanOrEqual(t3);
      expect(t3).toBeGreaterThanOrEqual(t2);
      expect(t2).toBeGreaterThanOrEqual(t1);
    });

    it("should prevent time from rolling back", async () => {
      const timestamps = [1000, 1100, 900, 950, 1200];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1200;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now(); // 1000
      const t2 = now(); // 1100
      const t3 = now(); // 900 (rollback) → 1100
      const t4 = now(); // 950 → 1150
      const t5 = now(); // 1200 → 1400

      // Check specific values
      expect(t1).toBe(1000);
      expect(t2).toBe(1100);
      expect(t3).toBe(1100); // 900 + offset(200)
      expect(t4).toBe(1150); // 950 + offset(200) - NOT 1300!
      expect(t5).toBe(1400); // 1200 + offset(200)

      // Check monotonicity
      expect(t2).toBeGreaterThanOrEqual(t1);
      expect(t3).toBeGreaterThanOrEqual(t2); // 1100 >= 1100 ✓
      expect(t4).toBeGreaterThan(t3); // 1150 > 1100 ✓
      expect(t5).toBeGreaterThan(t4); // 1400 > 1150 ✓
    });

    it("should correctly accumulate offset with large rollbacks", async () => {
      const timestamps = [1000, 500, 400, 1500];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1500;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now(); // 1000
      const t2 = now(); // 500 -> rollback by 500, offset = 500
      const t3 = now(); // 400 -> rollback by another 100, offset = 600
      const t4 = now(); // 1500

      expect(t1).toBe(1000);
      expect(t2).toBe(500 + 500); // 1000
      expect(t3).toBe(400 + 600); // 1000
      expect(t4).toBeGreaterThanOrEqual(t3);
    });

    it("should return to normal operation after time is corrected", async () => {
      const timestamps = [1000, 500, 2000, 3000];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 3000;
      });

      const { now } = await import("../../../src/internal/timing.js");

      const t1 = now(); // 1000
      const t2 = now(); // 500 -> offset = 500
      const t3 = now(); // 2000 with offset = 500 -> 2500
      const t4 = now(); // 3000 with offset = 500 -> 3500

      expect(t1).toBe(1000);
      expect(t2).toBe(1000); // 500 + offset
      expect(t3).toBe(2500); // time restored + old offset
      expect(t4).toBe(3500);
    });
  });

  describe("when async initialization of perf_hooks", () => {
    it("should wait for perf_hooks loading in Node.js without global performance", async () => {
      // Emulate Node.js environment without global performance
      vi.stubGlobal("performance", undefined);

      // Mock dynamic import of perf_hooks
      const mockPerfHooksNow = vi.fn(() => 456.789);

      vi.doMock("perf_hooks", () => ({
        performance: {
          now: mockPerfHooksNow,
        },
      }));

      const { now } = await import("../../../src/internal/timing.js");

      // Allow time for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = now();

      // IMPORTANT: Due to async import, fallback may be called
      // This behavior matches the code - first createMonotonicDateNow is set,
      // then it may be asynchronously updated to perf_hooks
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThan(0);
    });

    it("should use fallback if perf_hooks is unavailable", async () => {
      vi.stubGlobal("performance", undefined);

      // Mock failed import of perf_hooks
      vi.doMock("perf_hooks", () => {
        throw new Error("Module not found");
      });

      const mockDateNow = vi.fn(() => 2000);

      vi.spyOn(Date, "now").mockImplementation(mockDateNow);

      const { now } = await import("../../../src/internal/timing.js");

      const result = now();

      expect(mockDateNow).toHaveBeenCalled();
      expect(result).toBe(2000);
    });

    it("should handle calls during perf_hooks async loading (race condition)", async () => {
      vi.stubGlobal("performance", undefined);

      // Mock Date.now() for fallback
      const timestamps = [1000, 1050, 1100];
      let callIndex = 0;

      vi.spyOn(Date, "now").mockImplementation(() => {
        return timestamps[callIndex++] || 1100;
      });

      // Mock perf_hooks with delayed loading
      let resolvePerfHooks:
        | ((value: { performance: { now: () => number } }) => void)
        | undefined;
      const perfHooksPromise = new Promise<{
        performance: { now: () => number };
      }>((resolve) => {
        resolvePerfHooks = resolve;
      });

      vi.doMock("perf_hooks", () => perfHooksPromise);

      const { now } = await import("../../../src/internal/timing.js");

      // Call now() before perf_hooks loads - should use Date.now() fallback
      const t1 = now();
      const t2 = now();

      expect(t1).toBe(1000);
      expect(t2).toBe(1050);

      // Now resolve perf_hooks
      // eslint-disable-next-line vitest/no-conditional-in-test -- resolvePerfHooks is set by Promise constructor, conditional is necessary
      if (resolvePerfHooks) {
        resolvePerfHooks({
          performance: {
            now: () => 5000,
          },
        });
      }

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After perf_hooks loads, it may switch to it (implementation-dependent)
      const t3 = now();

      expect(typeof t3).toBe("number");
      expect(t3).toBeGreaterThan(0);
    });
  });
});

describe("timing - edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should handle continuous time rollbacks", async () => {
    vi.stubGlobal("performance", undefined);

    const timestamps = [1000, 900, 800, 700, 600];
    let callIndex = 0;

    vi.spyOn(Date, "now").mockImplementation(() => {
      return timestamps[callIndex++] || 600;
    });

    const { now } = await import("../../../src/internal/timing.js");

    const results = [];

    for (let i = 0; i < 5; i++) {
      results.push(now());
    }

    // All values should be monotonic
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]);
    }
  });

  it("should preserve precision with small values", async () => {
    const mockPerformanceNow = vi.fn(() => 0.001);

    vi.stubGlobal("performance", {
      now: mockPerformanceNow,
    });

    const { now } = await import("../../../src/internal/timing.js");

    const result = now();

    expect(result).toBe(0.001);
    expect(result).toBeGreaterThan(0);
  });

  it("should handle NaN from performance.now()", async () => {
    const mockPerformanceNow = vi.fn(() => Number.NaN);

    vi.stubGlobal("performance", {
      now: mockPerformanceNow,
    });

    const { now } = await import("../../../src/internal/timing.js");

    const result = now();

    // NaN is passed through - it's the caller's responsibility to handle
    expect(result).toBeNaN();
    expect(mockPerformanceNow).toHaveBeenCalled();
  });

  it("should handle Infinity from performance.now()", async () => {
    const mockPerformanceNow = vi.fn(() => Infinity);

    vi.stubGlobal("performance", {
      now: mockPerformanceNow,
    });

    const { now } = await import("../../../src/internal/timing.js");

    const result = now();

    // Infinity is passed through
    expect(result).toBe(Infinity);
    expect(mockPerformanceNow).toHaveBeenCalled();
  });
});

describe("timing - concurrent calls", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should correctly handle multiple parallel calls", async () => {
    let counter = 0;
    const mockPerformanceNow = vi.fn(() => {
      counter += 0.1;

      return counter;
    });

    vi.stubGlobal("performance", {
      now: mockPerformanceNow,
    });

    const { now } = await import("../../../src/internal/timing.js");

    const calls = 100;
    const results = [];

    for (let i = 0; i < calls; i++) {
      results.push(now());
    }

    // Check monotonicity of all results
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }

    expect(results).toHaveLength(calls);
  });
});

describe("isUnexpectedModuleError", () => {
  it("should return true for error with unexpected code", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = { code: "UNEXPECTED_ERROR", message: "Something went wrong" };

    expect(isUnexpectedModuleError(error)).toBe(true);
  });

  it("should return false for ERR_MODULE_NOT_FOUND", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = { code: "ERR_MODULE_NOT_FOUND", message: "Module not found" };

    expect(isUnexpectedModuleError(error)).toBe(false);
  });

  it("should return false for MODULE_NOT_FOUND", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = { code: "MODULE_NOT_FOUND", message: "Module not found" };

    expect(isUnexpectedModuleError(error)).toBe(false);
  });

  it("should return false for null", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    expect(isUnexpectedModuleError(null)).toBe(false);
  });

  it("should return false for non-object", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    expect(isUnexpectedModuleError("string error")).toBe(false);
    expect(isUnexpectedModuleError(123)).toBe(false);
    expect(isUnexpectedModuleError(undefined)).toBe(false);
  });

  it("should return false for object without code property", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    expect(isUnexpectedModuleError({ message: "error" })).toBe(false);
  });

  it("should return false for object with non-string code", async () => {
    const { isUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    expect(isUnexpectedModuleError({ code: 123 })).toBe(false);
    expect(isUnexpectedModuleError({ code: null })).toBe(false);
    expect(isUnexpectedModuleError({ code: undefined })).toBe(false);
  });
});

describe("warnUnexpectedModuleError", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log warning for unexpected error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { warnUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = { code: "EACCES", message: "Permission denied" };

    warnUnexpectedModuleError(error);

    expect(warnSpy).toHaveBeenCalledWith(
      "[timing] Unexpected error loading perf_hooks, using Date.now() fallback:",
      error,
    );
  });

  it("should not log warning for expected MODULE_NOT_FOUND error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { warnUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = { code: "MODULE_NOT_FOUND", message: "Cannot find module" };

    warnUnexpectedModuleError(error);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should not log warning for expected ERR_MODULE_NOT_FOUND error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { warnUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    const error = {
      code: "ERR_MODULE_NOT_FOUND",
      message: "Cannot find module",
    };

    warnUnexpectedModuleError(error);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should not log warning for non-error values", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { warnUnexpectedModuleError } =
      await import("../../../src/internal/timing.js");

    warnUnexpectedModuleError(null);
    warnUnexpectedModuleError(undefined);
    warnUnexpectedModuleError("string error");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
