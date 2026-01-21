import { logger } from "logger";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getParamsDiff,
  logParamsDiff,
} from "../../../src/internal/params-diff";

import type { Params } from "@real-router/core";

describe("params-diff utilities", () => {
  describe("getParamsDiff", () => {
    it("should return null when params are identical", () => {
      const params: Params = { id: "123", tab: "profile" };

      expect(getParamsDiff(params, params)).toBeNull();
    });

    it("should return null when both params are empty", () => {
      expect(getParamsDiff({}, {})).toBeNull();
    });

    it("should detect changed parameters", () => {
      const from: Params = { id: "123", tab: "profile" };
      const to: Params = { id: "456", tab: "profile" };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: { id: { from: "123", to: "456" } },
        added: {},
        removed: {},
      });
    });

    it("should detect added parameters", () => {
      const from: Params = { id: "123" };
      const to: Params = { id: "123", tab: "settings" };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: {},
        added: { tab: "settings" },
        removed: {},
      });
    });

    it("should detect removed parameters", () => {
      const from: Params = { id: "123", tab: "profile" };
      const to: Params = { id: "123" };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: {},
        added: {},
        removed: { tab: "profile" },
      });
    });

    it("should detect multiple types of changes simultaneously", () => {
      const from: Params = { id: "123", tab: "profile", sort: "name" };
      const to: Params = { id: "456", tab: "profile", page: "2" };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: { id: { from: "123", to: "456" } },
        added: { page: "2" },
        removed: { sort: "name" },
      });
    });

    it("should handle undefined values", () => {
      const from: Params = { id: "123", tab: undefined };
      const to: Params = { id: "123" };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: {},
        added: {},
        removed: { tab: undefined },
      });
    });

    it("should handle number and boolean values", () => {
      const from: Params = { page: 1, active: true };
      const to: Params = { page: 2, active: false };

      const diff = getParamsDiff(from, to);

      expect(diff).toStrictEqual({
        changed: {
          page: { from: 1, to: 2 },
          active: { from: true, to: false },
        },
        added: {},
        removed: {},
      });
    });

    it("should perform shallow comparison only", () => {
      const from: Params = { user: { id: "123" } };
      const to: Params = { user: { id: "123" } };

      const diff = getParamsDiff(from, to);

      // Objects are different references, should be detected as changed
      expect(diff).toStrictEqual({
        changed: {
          user: { from: { id: "123" }, to: { id: "123" } },
        },
        added: {},
        removed: {},
      });
    });
  });

  describe("logParamsDiff", () => {
    const noop = () => {};
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(logger, "log").mockImplementation(noop);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should log changed parameters", () => {
      const diff = {
        changed: { id: { from: "123", to: "456" } },
        added: {},
        removed: {},
      };

      logParamsDiff(diff, "test-context");

      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        '  Changed: { id: "123" → "456" }',
      );
    });

    it("should log added parameters", () => {
      const diff = {
        changed: {},
        added: { tab: "settings" },
        removed: {},
      };

      logParamsDiff(diff, "test-context");

      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        '  Added: {"tab":"settings"}',
      );
    });

    it("should log removed parameters", () => {
      const diff = {
        changed: {},
        added: {},
        removed: { tab: "profile" },
      };

      logParamsDiff(diff, "test-context");

      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        '  Removed: {"tab":"profile"}',
      );
    });

    it("should log all changes together", () => {
      const diff = {
        changed: { id: { from: "123", to: "456" } },
        added: { page: "2" },
        removed: { sort: "name" },
      };

      logParamsDiff(diff, "test-context");

      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        expect.stringContaining('Changed: { id: "123" → "456" }'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        expect.stringContaining('Added: {"page":"2"}'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        "test-context",
        expect.stringContaining('Removed: {"sort":"name"}'),
      );
    });

    it("should handle multiple changed parameters", () => {
      const diff = {
        changed: {
          id: { from: "123", to: "456" },
          tab: { from: "profile", to: "settings" },
        },
        added: {},
        removed: {},
      };

      logParamsDiff(diff, "test-context");

      const call = logSpy.mock.calls[0][1] as string;

      expect(call).toContain('id: "123" → "456"');
      expect(call).toContain('tab: "profile" → "settings"');
    });

    it("should use correct context", () => {
      const diff = {
        changed: { id: { from: "1", to: "2" } },
        added: {},
        removed: {},
      };

      logParamsDiff(diff, "custom-context");

      expect(logSpy).toHaveBeenCalledWith("custom-context", expect.any(String));
    });
  });
});
