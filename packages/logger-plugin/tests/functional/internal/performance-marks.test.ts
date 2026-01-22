import { logger } from "logger";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  supportsPerformanceAPI,
  createPerformanceTracker,
} from "../../../src/internal/performance-marks";

// Helper function for mock implementation
const noop = () => {};

// Test context constant to avoid duplication
const TEST_CONTEXT = "test-context";

describe("performance-marks utilities", () => {
  describe("supportsPerformanceAPI", () => {
    it("should return true when Performance API is available", () => {
      expect(supportsPerformanceAPI()).toBe(true);
    });

    it("should return false when performance is undefined", () => {
      const originalPerformance = globalThis.performance;

      Object.defineProperty(globalThis, "performance", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(supportsPerformanceAPI()).toBe(false);

      Object.defineProperty(globalThis, "performance", {
        value: originalPerformance,
        writable: true,
        configurable: true,
      });
    });

    it("should return false when performance.mark is missing", () => {
      const originalMark = performance.mark.bind(performance);

      // @ts-expect-error - testing edge case
      performance.mark = undefined;

      expect(supportsPerformanceAPI()).toBe(false);

      performance.mark = originalMark;
    });

    it("should return false when performance.measure is missing", () => {
      const originalMeasure = performance.measure.bind(performance);

      // @ts-expect-error - testing edge case
      performance.measure = undefined;

      expect(supportsPerformanceAPI()).toBe(false);

      performance.measure = originalMeasure;
    });
  });

  describe("createPerformanceTracker", () => {
    // @ts-expect-error - SpyInstance type inference issue with beforeEach initialization
    let markSpy: vi.SpyInstance;
    // @ts-expect-error - SpyInstance type inference issue with beforeEach initialization
    let measureSpy: vi.SpyInstance;
    // @ts-expect-error - SpyInstance type inference issue with beforeEach initialization
    let warnSpy: vi.SpyInstance;

    beforeEach(() => {
      markSpy = vi.spyOn(performance, "mark").mockImplementation(noop as any);
      measureSpy = vi
        .spyOn(performance, "measure")
        .mockImplementation(noop as any);
      warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("when enabled and supported", () => {
      it("should create performance mark", () => {
        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        tracker.mark("test-mark");

        expect(markSpy).toHaveBeenCalledWith("test-mark");
      });

      it("should create performance measure", () => {
        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        tracker.measure("test-measure", "start-mark", "end-mark");

        expect(measureSpy).toHaveBeenCalledWith(
          "test-measure",
          "start-mark",
          "end-mark",
        );
      });

      it("should handle measure errors gracefully", () => {
        measureSpy.mockImplementation(() => {
          throw new Error("Marks not found");
        });

        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        expect(() => {
          tracker.measure("test", "missing-start", "missing-end");
        }).not.toThrowError();

        expect(warnSpy).toHaveBeenCalledWith(
          TEST_CONTEXT,
          "Failed to create performance measure: test",
          expect.any(Error),
        );
      });

      it("should handle multiple marks", () => {
        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        tracker.mark("mark1");
        tracker.mark("mark2");
        tracker.mark("mark3");

        expect(markSpy).toHaveBeenCalledTimes(3);
      });

      it("should handle multiple measures", () => {
        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        tracker.measure("measure1", "start1", "end1");
        tracker.measure("measure2", "start2", "end2");

        expect(measureSpy).toHaveBeenCalledTimes(2);
      });
    });

    describe("when disabled", () => {
      it("should not create marks", () => {
        const tracker = createPerformanceTracker(false, TEST_CONTEXT);

        tracker.mark("test-mark");

        expect(markSpy).not.toHaveBeenCalled();
      });

      it("should not create measures", () => {
        const tracker = createPerformanceTracker(false, TEST_CONTEXT);

        tracker.measure("test-measure", "start", "end");

        expect(measureSpy).not.toHaveBeenCalled();
      });

      it("should not log warnings", () => {
        const tracker = createPerformanceTracker(false, TEST_CONTEXT);

        tracker.measure("test", "start", "end");

        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    describe("when API is not supported", () => {
      let originalPerformance: Performance;

      beforeEach(() => {
        originalPerformance = globalThis.performance;
        Object.defineProperty(globalThis, "performance", {
          value: undefined,
          writable: true,
          configurable: true,
        });
      });

      afterEach(() => {
        Object.defineProperty(globalThis, "performance", {
          value: originalPerformance,
          writable: true,
          configurable: true,
        });
      });

      it("should not throw when API is missing", () => {
        expect(() => {
          const tracker = createPerformanceTracker(true, TEST_CONTEXT);

          tracker.mark("test");
          tracker.measure("test", "start", "end");
        }).not.toThrowError();
      });
    });

    describe("context usage", () => {
      it("should use provided context in warnings", () => {
        measureSpy.mockImplementation(() => {
          throw new Error("Test error");
        });

        const tracker = createPerformanceTracker(true, "custom-context");

        tracker.measure("test", "start", "end");

        expect(warnSpy).toHaveBeenCalledWith(
          "custom-context",
          expect.any(String),
          expect.any(Error),
        );
      });
    });

    describe("error scenarios", () => {
      it("should handle DOMException from Performance API", () => {
        measureSpy.mockImplementation(() => {
          const error = new Error("InvalidAccessError");

          error.name = "InvalidAccessError";

          throw error;
        });

        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        expect(() => {
          tracker.measure("test", "nonexistent", "end");
        }).not.toThrowError();

        expect(warnSpy).toHaveBeenCalled();
      });

      it("should continue working after measure error", () => {
        let callCount = 0;

        measureSpy.mockImplementation(() => {
          if (callCount++ === 0) {
            throw new Error("First call fails");
          }
        });

        const tracker = createPerformanceTracker(true, TEST_CONTEXT);

        tracker.measure("failing", "start", "end");
        tracker.measure("working", "start", "end");

        expect(measureSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
