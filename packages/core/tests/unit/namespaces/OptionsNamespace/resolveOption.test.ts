import { describe, it, expect, vi } from "vitest";

import { resolveOption } from "../../../../src/namespaces/OptionsNamespace/helpers";

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
    it("should invoke callback with getDependency", () => {
      const getDep = vi.fn().mockReturnValue("users");
      const callback = vi.fn((getDep: any) => getDep("routeName"));

      const result = resolveOption(callback as any, getDep);

      expect(callback).toHaveBeenCalledWith(getDep);
      expect(getDep).toHaveBeenCalledWith("routeName");
      expect(result).toBe("users");
    });

    it("should return callback result", () => {
      const getDep = vi.fn().mockReturnValue("admin");
      const callback = (getDep: any) => getDep("defaultRoute");

      const result = resolveOption(callback as any, getDep);

      expect(result).toBe("admin");
    });
  });
});
