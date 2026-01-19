import { describe, it, expect } from "vitest";

import {
  formatRouteName,
  formatTiming,
} from "../../../modules/internal/formatting";

import type { State } from "router6";

describe("formatting utilities", () => {
  describe("formatRouteName", () => {
    it("should return route name when state is defined", () => {
      const state = {
        name: "users.view",
        params: {},
        path: "/users/123",
      } as State;

      expect(formatRouteName(state)).toBe("users.view");
    });

    it("should return (none) when state is undefined", () => {
      expect(formatRouteName()).toBe("(none)");
    });

    it("should return (none) when state name is undefined", () => {
      const state = {
        name: undefined,
        params: {},
        path: "/",
      } as unknown as State;

      expect(formatRouteName(state)).toBe("(none)");
    });

    it("should handle empty string name", () => {
      const state = { name: "", params: {}, path: "/" } as State;

      expect(formatRouteName(state)).toBe("");
    });
  });

  describe("formatTiming", () => {
    const mockNow = vi.fn();

    it("should return empty string when startTime is null", () => {
      mockNow.mockReturnValue(100);

      expect(formatTiming(null, mockNow)).toBe("");
      expect(mockNow).not.toHaveBeenCalled();
    });

    it("should format microseconds for very fast operations (<0.1ms)", () => {
      mockNow.mockReturnValue(100.05); // 50μs = 0.05ms

      const result = formatTiming(100, mockNow);

      expect(result).toBe(" (50.00μs)");
    });

    it("should format milliseconds for normal operations (≥0.1ms)", () => {
      mockNow.mockReturnValue(105.5); // 5.5ms

      const result = formatTiming(100, mockNow);

      expect(result).toBe(" (5.50ms)");
    });

    it("should handle zero duration", () => {
      mockNow.mockReturnValue(100);

      const result = formatTiming(100, mockNow);

      expect(result).toBe(" (0.00μs)");
    });

    it("should handle large durations", () => {
      mockNow.mockReturnValue(1100); // 1000ms = 1s

      const result = formatTiming(100, mockNow);

      expect(result).toBe(" (1000.00ms)");
    });

    it("should use exactly 2 decimal places", () => {
      mockNow.mockReturnValue(100.123_456);

      const result = formatTiming(100, mockNow);

      expect(result).toMatch(/^\s\(\d+\.\d{2}[mμ]s\)$/);
    });

    it("should handle NaN from now() function", () => {
      mockNow.mockReturnValue(Number.NaN);

      expect(formatTiming(100, mockNow)).toBe(" (?)");
    });

    it("should handle negative duration", () => {
      mockNow.mockReturnValue(50); // startTime = 100, now = 50

      expect(formatTiming(100, mockNow)).toBe(" (?)");
    });

    it("should handle Infinity from now() function", () => {
      mockNow.mockReturnValue(Infinity);

      expect(formatTiming(100, mockNow)).toBe(" (?)");
    });

    it("should handle -Infinity from now() function", () => {
      mockNow.mockReturnValue(-Infinity);
      const result = formatTiming(100, mockNow);

      expect(result).toBe(" (?)");
    });
  });
});
