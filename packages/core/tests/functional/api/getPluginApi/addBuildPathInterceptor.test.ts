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

  it("registering an interceptor for a non-interceptable method is a silent no-op", () => {
    // Core does NOT validate the method name (only @real-router/validation-plugin
    // does). The interceptor is stored in the Map but never wrapped, so it never
    // fires — and registration neither throws nor returns a broken unsubscribe.
    let called = false;

    const unsub = api.addInterceptor(
      "notAnInterceptableMethod" as never,
      (() => {
        called = true;
      }) as never,
    );

    // Exercising a genuinely interceptable method must not trigger the bogus one.
    router.buildPath("users.view", { id: "x" });

    expect(called).toBe(false);
    expect(typeof unsub).toBe("function");
    expect(() => {
      unsub();
    }).not.toThrow();
  });
});
