import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

/**
 * Targeted kills for getPluginApi invariant-guard / cleanup mutants, probed
 * through PUBLIC behaviour (no `getInternals`):
 *  - conflict-error MESSAGE text (existing suites assert only `.code`)
 *  - the `removed` idempotency flag on extendRouter's unsubscribe
 *  - extendRouter cleanup: the removed key leaves the router INSTANCE and is
 *    freed for re-extension (the instance `delete`, not the tracking array)
 *  - the interceptor-list splice, observed via the actual `buildPath` chain
 *    (a stale / wrong-index unsubscribe must not drop a sibling interceptor)
 */
describe("getPluginApi invariant-guard mutants", () => {
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

  describe("conflict error messages", () => {
    it("PLUGIN_CONFLICT message names the conflicting property", () => {
      let caught: RouterError | undefined;

      try {
        api.extendRouter({ navigate: () => {} });
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.message).toContain("Cannot extend router");
      expect(caught!.message).toContain("navigate");
      expect(caught!.message).toContain("already exists");
    });

    it("CONTEXT_NAMESPACE_ALREADY_CLAIMED message names the namespace", () => {
      api.claimContextNamespace("ns-probe");

      const api2 = getPluginApi(router);
      let caught: RouterError | undefined;

      try {
        api2.claimContextNamespace("ns-probe");
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.message).toContain("Cannot claim context namespace");
      expect(caught!.message).toContain("ns-probe");
      expect(caught!.message).toContain("already claimed");
    });
  });

  describe("extendRouter unsubscribe — `removed` idempotency flag", () => {
    it("a stale unsubscribe must NOT remove a re-added extension", () => {
      const unsub = api.extendRouter({ ext: 1 });

      unsub(); // removes ext
      api.extendRouter({ ext: 2 }); // re-add the now-free key
      unsub(); // stale call — must be a no-op, not delete the re-added value

      expect((router as Record<string, unknown>).ext).toBe(2);
    });
  });

  describe("extendRouter unsubscribe — instance cleanup & freed key", () => {
    it("unsubscribing one extension removes only its keys and frees them for re-extension", () => {
      const u1 = api.extendRouter({ extA: 1 });

      api.extendRouter({ extB: 2 });

      expect((router as Record<string, unknown>).extA).toBe(1);
      expect((router as Record<string, unknown>).extB).toBe(2);

      u1(); // removes extA only

      // The key left the router instance...
      expect((router as Record<string, unknown>).extA).toBeUndefined();
      // ...and the sibling extension is untouched.
      expect((router as Record<string, unknown>).extB).toBe(2);

      // extA's key is freed — re-extending it must NOT throw PLUGIN_CONFLICT.
      expect(() => api.extendRouter({ extA: 3 })).not.toThrow();
      expect((router as Record<string, unknown>).extA).toBe(3);
    });
  });

  describe("addInterceptor unsubscribe — interceptor chain (observed via buildPath)", () => {
    // buildPath interceptors that tag the produced path, so we can observe which
    // interceptors are still in the chain through the real `router.buildPath`.
    const tagWith =
      (mark: string) =>
      (next: (...a: unknown[]) => unknown, route: unknown, params: unknown) =>
        `${String(next(route, params))}${mark}`;

    it("a stale unsubscribe must NOT remove a sibling interceptor", () => {
      const unsubA = api.addInterceptor("buildPath", tagWith("#A") as never);

      api.addInterceptor("buildPath", tagWith("#B") as never);

      expect(router.buildPath("home")).toContain("#A");
      expect(router.buildPath("home")).toContain("#B");

      unsubA(); // removes A (index 0)

      expect(router.buildPath("home")).not.toContain("#A");
      expect(router.buildPath("home")).toContain("#B");

      unsubA(); // stale — indexOf is now -1; must NOT splice(-1, 1) out B

      expect(router.buildPath("home")).toContain("#B");
    });

    it("unsubscribing a non-first interceptor removes the correct one", () => {
      api.addInterceptor("buildPath", tagWith("#A") as never);

      const unsubB = api.addInterceptor("buildPath", tagWith("#B") as never);

      unsubB(); // index 1 — kills the -1→+1 unary mutant

      expect(router.buildPath("home")).toContain("#A");
      expect(router.buildPath("home")).not.toContain("#B");
    });
  });
});
