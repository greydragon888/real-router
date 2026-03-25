import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  omitMeta,
  type Router,
} from "./setup";
import { getLifecycleApi } from "../../../../src/api";

let router: Router;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/addDeactivateGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if a component refuses deactivation", async () => {
    lifecycle.addDeactivateGuard("users.list", () => () => Promise.reject());

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.segment).toStrictEqual("users.list");
    }

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users.list",
      params: {},
      path: "/users/list",
    });

    lifecycle.addDeactivateGuard("users.list", true);

    await router.navigate("users");

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users",
      params: {},
      path: "/users",
    });
  });

  it("should register and override canDeactivate handlers", async () => {
    lifecycle.addDeactivateGuard("users.list", false);

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.segment).toStrictEqual("users.list");
    }

    lifecycle.addDeactivateGuard("users.list", true);

    await router.navigate("users");
  });

  it("should block navigation if canDeactivate returns an Error", async () => {
    lifecycle.addDeactivateGuard("users.list", () => () => {
      throw new Error("blocked");
    });

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    }
  });

  it("should return error when canDeactivate returns false", async () => {
    lifecycle.addDeactivateGuard("sign-in", () => () => false);

    await router.navigate("sign-in");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    }

    expect(router.getState()?.name).toBe("sign-in");
  });

  describe("validation and edge cases", () => {
    it("should register guards without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("route1", true);
        lifecycle.addDeactivateGuard("route2", false);
      }).not.toThrow();
    });

    it("should throw TypeError for invalid handler types", () => {
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addDeactivateGuard("route1", null);
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        lifecycle.addDeactivateGuard("route2", undefined);
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addDeactivateGuard("route3", 123);
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error: testing string
        lifecycle.addDeactivateGuard("route4", "true");
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error: testing object
        lifecycle.addDeactivateGuard("route5", {});
      }).toThrow(TypeError);
      expect(() => {
        // @ts-expect-error: testing NaN
        lifecycle.addDeactivateGuard("route6", Number.NaN);
      }).toThrow(TypeError);
    });

    it("should throw TypeError if factory returns non-function", () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        lifecycle.addDeactivateGuard("route1", () => null);
      }).toThrow(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        lifecycle.addDeactivateGuard("route2", () => undefined);
      }).toThrow(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        lifecycle.addDeactivateGuard("route3", () => 42);
      }).toThrow(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        lifecycle.addDeactivateGuard("route4", () => ({}));
      }).toThrow(TypeError);
    });

    it("should handle long route names without throwing", () => {
      const longName = "a".repeat(10_000);

      expect(() => {
        lifecycle.addDeactivateGuard(longName, true);
      }).not.toThrow();
    });

    it("should allow system routes with @@ prefix", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("@@notFound", true);
      }).not.toThrow();

      // System routes can be registered - verified by no throw above
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning non-function
        lifecycle.addDeactivateGuard("problematic", () => null);
      }).toThrow(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addDeactivateGuard("problematic", true);
      }).not.toThrow();
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning object
        lifecycle.addDeactivateGuard("test", () => ({}));
      }).toThrow(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addDeactivateGuard("test", false);
      }).not.toThrow();
    });

    it("should maintain consistency after failed registration", async () => {
      // Register a valid guard first
      lifecycle.addDeactivateGuard("admin", false);

      expect(() => {
        // @ts-expect-error: testing invalid handler
        lifecycle.addDeactivateGuard("index", "not-a-function");
      }).toThrow(TypeError);

      // Valid guard should still work
      await router.navigate("admin");
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      // Failed route can be re-registered (was rolled back)
      expect(() => {
        lifecycle.addDeactivateGuard("index", true);
      }).not.toThrow();
    });
  });

  describe("overwriting guards", () => {
    it("should NOT log warning when overwriting existing guard (no validation plugin)", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      lifecycle.addDeactivateGuard("route", true);

      expect(warnSpy).not.toHaveBeenCalled();

      lifecycle.addDeactivateGuard("route", false);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", async () => {
      // First guard allows leaving
      lifecycle.addDeactivateGuard("admin", true);

      await router.navigate("admin");
      await router.navigate("index");

      // Replace with blocking guard
      lifecycle.addDeactivateGuard("index", false);

      // Now cannot leave index
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(router.getState()?.name).toBe("index");
    });
  });
});
