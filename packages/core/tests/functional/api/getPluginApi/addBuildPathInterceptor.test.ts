import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

let router: Router;
let api: PluginApi;

describe("addInterceptor('buildPath')", () => {
  beforeEach(async () => {
    router = createTestRouter();
    api = getPluginApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  // #1847. An interceptor may hand `next` FEWER arguments than it received —
  // `persistent-params` does exactly that with the fourth one — so the door
  // behind the seam still defaults an omitted params bag. Core's own callers
  // stopped exercising that arm when the merge moved above the seam: both of
  // them (the facade's intent form and `buildURL`) now pass a defined bag.
  it("defaults the params bag when an interceptor drops it", () => {
    api.addInterceptor("buildPath", (next, route) => next(route));

    // A route with no required slot, so dropping the bag is survivable — on
    // `users.view` the matcher legitimately throws `Missing required param`.
    expect(router.buildPath("home", { unused: "x" })).toBe("/home");
  });

  it("transforms params in facade buildPath() calls", () => {
    api.addInterceptor("buildPath", (next, route, params) =>
      next(route, { ...params, id: "intercepted-42" }),
    );

    const path = router.buildPath("users.view", { id: "original" });

    expect(path).toBe("/users/view/intercepted-42");
  });

  it("transforms params in buildPath() inside navigate() — state.path reflects intercepted params", async () => {
    api.addInterceptor("buildPath", (next, route, params) =>
      next(route, { ...params, id: "intercepted-99" }),
    );

    const state = await router.navigate("users.view", { id: "original" });

    expect(state.path).toBe("/users/view/intercepted-99");
  });

  describe("pipeline composition", () => {
    it("two interceptors compose — last-added is outermost", () => {
      api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: `first-${params?.id as string}` }),
      );

      api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: `second-${params?.id as string}` }),
      );

      const path = router.buildPath("users.view", { id: "0" });

      expect(path).toBe("/users/view/first-second-0");
    });
  });

  describe("unsubscribe", () => {
    it("correctly removes interceptor from pipeline", () => {
      const unsub = api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: "intercepted" }),
      );

      unsub();

      const path = router.buildPath("users.view", { id: "original" });

      expect(path).toBe("/users/view/original");
    });

    it("interceptor is NOT called after unsubscribe", () => {
      let callCount = 0;

      const unsub = api.addInterceptor("buildPath", (next, route, params) => {
        callCount++;

        return next(route, params);
      });

      router.buildPath("home");

      expect(callCount).toBe(1);

      unsub();

      router.buildPath("home");

      expect(callCount).toBe(1);
    });

    it("double unsubscribe is a no-op", () => {
      const unsub = api.addInterceptor("buildPath", (next, route, params) =>
        next(route, { ...params, id: "intercepted" }),
      );

      unsub();
      unsub();

      const path = router.buildPath("users.view", { id: "original" });

      expect(path).toBe("/users/view/original");
    });

    it("double unsubscribe does NOT remove a duplicate registration of the same fn (#1198)", () => {
      // The same fn registered twice (e.g. a shared module-level interceptor
      // helper used by two plugin instances). The `Unsubscribe` contract is
      // idempotent — calling the FIRST unsubscribe twice must not touch the
      // SECOND registration, whose own unsubscribe was never called.
      let hits = 0;
      const shared = (next: any, route: string, params: any) => {
        hits++;

        return next(route, params);
      };

      const unsub1 = api.addInterceptor("buildPath", shared);

      api.addInterceptor("buildPath", shared); // 2nd registration — unsubscribe never called

      unsub1();
      unsub1(); // documented as safe — must be a true no-op after the first call

      router.buildPath("home");

      // The surviving 2nd registration must still fire.
      expect(hits).toBe(1);
    });
  });

  describe("empty pipeline", () => {
    it("buildPath works as before with no interceptors (no regression)", () => {
      const path = router.buildPath("users.view", { id: "42" });

      expect(path).toBe("/users/view/42");
    });
  });

  describe("disposed router", () => {
    it("throws ROUTER_DISPOSED on disposed router", () => {
      router.dispose();

      const disposedApi = getPluginApi(router);

      expect(() => {
        disposedApi.addInterceptor("buildPath", (next, route, params) =>
          next(route, params),
        );
      }).toThrow(RouterError);
    });
  });

  describe("short-circuit (interceptor returns without next)", () => {
    it("skips the original buildPath when the interceptor never calls next()", () => {
      // By-design: an interceptor that returns a value without invoking `next`
      // halts the chain, so the original buildPath is never called. Returning a
      // sentinel that differs from the real path proves the original was bypassed.
      api.addInterceptor("buildPath", () => "HALTED");

      expect(router.buildPath("users.view", { id: "original" })).toBe("HALTED");
    });
  });
});

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
        /"forwadState".*start, buildPath, forwardState/,
      );
    });

    it("refuses a non-string method", () => {
      expect(() => raw().addInterceptor(123, () => {})).toThrow(TypeError);
      expect(() => raw().addInterceptor(null, () => {})).toThrow(TypeError);
    });

    // Nothing in the refusal coerces the name. Without the `typeof` term
    // `Object.hasOwn` performs `ToPropertyKey`, so this object would be ADMITTED
    // as `buildPath`; and rendering it through `String()` in the message would
    // run the same `toString` one line after the refusal.
    it("refuses an object method name without calling its toString", () => {
      let coerced = 0;
      const hostile = {
        toString: () => {
          coerced++;

          return "buildPath";
        },
      };

      expect(() => raw().addInterceptor(hostile, () => {})).toThrow(TypeError);
      expect(coerced).toBe(0);
    });

    // The other half of the criterion, on the same call: a non-function is
    // accepted at registration and crashes at the seam, so the name check alone
    // would close one arm of a two-arm defect.
    it("refuses a non-function interceptor, even under a REAL method name", () => {
      expect(() => raw().addInterceptor("buildPath", "not a function")).toThrow(
        TypeError,
      );
      expect(() => raw().addInterceptor("buildPath", undefined)).toThrow(
        TypeError,
      );
    });

    // CONTROL — without it every assertion above is satisfied by a door that
    // refuses everything.
    it("CONTROL — each real seam still registers, fires and unsubscribes", () => {
      const SEAMS = ["start", "buildPath", "forwardState"] as const;

      expect(SEAMS).toHaveLength(3);

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
