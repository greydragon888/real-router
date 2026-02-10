import { describe, it, expect, vi } from "vitest";

import { resolveOption } from "../../../../src/namespaces/OptionsNamespace/helpers";

import type { Options } from "@real-router/types";

describe("resolveOption", () => {
  describe("with static string value", () => {
    it("should return string unchanged", () => {
      const getDep = vi.fn();
      const result = resolveOption("home", getDep);

      expect(result).toBe("home");
      expect(getDep).not.toHaveBeenCalled();
    });
  });

  describe("with static Params value", () => {
    it("should return Params object unchanged", () => {
      const getDep = vi.fn();
      const params = { id: "123", tab: "profile" };
      const result = resolveOption(params, getDep);

      expect(result).toBe(params);
      expect(getDep).not.toHaveBeenCalled();
    });
  });

  describe("with callback function", () => {
    it("should invoke route callback with getDependency", () => {
      const getDep = vi.fn().mockReturnValue("users");
      const callback = vi.fn(
        (getDep: (name: string) => unknown) => getDep("routeName") as string,
      );

      const result = resolveOption(callback as Options["defaultRoute"], getDep);

      expect(callback).toHaveBeenCalledWith(getDep);
      expect(getDep).toHaveBeenCalledWith("routeName");
      expect(result).toBe("users");
    });

    it("should invoke params callback with getDependency", () => {
      const getDep = vi.fn().mockReturnValue("42");
      const callback = (getDep: (name: string) => unknown) => ({
        id: getDep("userId"),
      });

      const result = resolveOption(
        callback as unknown as Options["defaultParams"],
        getDep,
      );

      expect(result).toStrictEqual({ id: "42" });
    });

    it("should return callback result", () => {
      const getDep = vi.fn().mockReturnValue("admin");
      const callback = (getDep: (name: string) => unknown) =>
        getDep("defaultRoute") as string;

      const result = resolveOption(callback as Options["defaultRoute"], getDep);

      expect(result).toBe("admin");
    });
  });
});
