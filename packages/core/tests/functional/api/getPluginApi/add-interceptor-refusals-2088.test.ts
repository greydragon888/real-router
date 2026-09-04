import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

describe("addInterceptor — unregistered method name", () => {
  let router: Router;
  let api: PluginApi;

  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  // #2088. The sixth always-on guard. Registration is the only moment core can
  // still tell the plugin author anything: after it, a mis-named interceptor is
  // a live registration that never fires, with a working `Unsubscribe` and a
  // green suite, and a non-function one is a `TypeError` deferred to whichever
  // navigation reaches the seam first.
  describe("refuses what it cannot run (#2088)", () => {
    const raw = (): {
      addInterceptor: (method: unknown, fn: unknown) => unknown;
    } => api as never;

    it("refuses a method name core does not intercept", () => {
      expect(() => raw().addInterceptor("forwadState", () => {})).toThrow(
        TypeError,
      );
    });

    it("names the method and the set it is not in", () => {
      expect(() => raw().addInterceptor("forwadState", () => {})).toThrow(
        /"forwadState".*start, forwardState/,
      );
    });

    it("refuses a non-string method", () => {
      expect(() => raw().addInterceptor(123, () => {})).toThrow(TypeError);
      expect(() => raw().addInterceptor(null, () => {})).toThrow(TypeError);
    });

    // Nothing in the refusal coerces the name. Without the `typeof` term
    // `Object.hasOwn` performs `ToPropertyKey`, so this object would be ADMITTED
    // as `forwardState`; and rendering it through `String()` in the message would
    // run the same `toString` one line after the refusal.
    it("refuses an object method name without calling its toString", () => {
      let coerced = 0;
      const hostile = {
        toString: () => {
          coerced++;

          return "forwardState";
        },
      };

      expect(() => raw().addInterceptor(hostile, () => {})).toThrow(TypeError);
      expect(coerced).toBe(0);
    });

    // The other half of the criterion, on the same call: a non-function is
    // accepted at registration and crashes at the seam, so the name check alone
    // would close one arm of a two-arm defect.
    it("refuses a non-function interceptor, even under a REAL method name", () => {
      expect(() =>
        raw().addInterceptor("forwardState", "not a function"),
      ).toThrow(TypeError);
      expect(() => raw().addInterceptor("forwardState", undefined)).toThrow(
        TypeError,
      );
    });

    // CONTROL — without it every assertion above is satisfied by a door that
    // refuses everything.
    it("CONTROL — each real seam still registers, fires and unsubscribes", () => {
      const SEAMS = ["start", "forwardState"] as const;

      expect(SEAMS).toHaveLength(2);

      for (const seam of SEAMS) {
        const unsub = raw().addInterceptor(
          seam,
          (next: (...a: unknown[]) => unknown, ...args: unknown[]) =>
            next(...args),
        );

        expect(typeof unsub).toBe("function");
        expect(unsub).not.toThrow();
      }

      expect(router.buildPath("users.view", { id: "x" })).toBe("/users/view/x");
    });
  });
});
