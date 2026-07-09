import { createRouter, RouterError } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

let router: Router;

describe("validationPlugin", () => {
  afterEach(() => {
    router.stop();
  });

  describe("registration", () => {
    it("registers before start without error", () => {
      router = createRouter([{ name: "home", path: "/home" }]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("throws VALIDATION_PLUGIN_AFTER_START when registered after start", async () => {
      router = createRouter([{ name: "home", path: "/home" }]);
      await router.start("/home");

      expect(() => router.usePlugin(validationPlugin())).toThrow(RouterError);
      expect(() => router.usePlugin(validationPlugin())).toThrow(
        "validation-plugin must be registered before router.start()",
      );
    });

    it("throws VALIDATION_PLUGIN_AFTER_START error message", async () => {
      router = createRouter([{ name: "home", path: "/home" }]);
      await router.start("/home");

      expect(() => router.usePlugin(validationPlugin())).toThrow(
        "validation-plugin must be registered before router.start()",
      );
    });
  });

  describe("teardown", () => {
    it("removes validator on teardown - navigate no longer validates", async () => {
      router = createRouter([{ name: "home", path: "/home" }]);
      const unsubscribe = router.usePlugin(validationPlugin());

      await router.start("/home");

      expect(() => {
        // @ts-expect-error testing runtime validation
        void router.navigate(123);
      }).toThrow(TypeError);

      unsubscribe();

      expect(() => {
        // @ts-expect-error testing runtime validation
        void router.navigate(123);
      }).not.toThrow();
    });
  });

  describe("retrospective validation on registration", () => {
    it("duplicate route names are rejected at construction — core pre-empts the retrospective pass (#1351)", () => {
      // Bare core rejects a duplicate sibling name at createRouter() time
      // (#1351), so a duplicate-name router can no longer be built for the
      // plugin to catch retrospectively — the concern is core's now.
      router = createRouter([{ name: "home", path: "/home" }]);

      expect(() =>
        createRouter([
          { name: "home", path: "/home" },
          { name: "home", path: "/duplicate" },
        ]),
      ).toThrow(/Duplicate route "home" in batch/);
    });

    it("rolls back validator on retrospective error", () => {
      // Trigger repointed from a duplicate name (now rejected by bare core at
      // construction, #1351) to a dotted name — still a retrospective-only
      // rejection (#1194) that bare core accepts, so usePlugin() is reached and
      // the rollback path exercised.
      router = createRouter([{ name: "users.view", path: "/:id" }]);

      expect(() => router.usePlugin(validationPlugin())).toThrow();

      expect(() => {
        // @ts-expect-error testing without plugin
        void router.navigate(123);
      }).not.toThrow(TypeError);
    });

    it("accepts valid router state at registration", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ]);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("throws when existing dependencies exceed limit", () => {
      const deps: Record<string, number> = {};

      for (let i = 0; i < 5; i++) {
        deps[`dep${i}`] = i;
      }

      const r = createRouter<Record<string, number>>(
        [],
        { limits: { maxDependencies: 3 } },
        deps,
      );

      expect(() => r.usePlugin(validationPlugin())).toThrow(RangeError);
    });

    // NOTE (#967): the former "retrospective catches an async forwardTo" test was
    // removed — its scenario is now unreachable. It injected an async forwardTo
    // via `update()` WITHOUT the plugin (relying on core silently accepting it),
    // then registered the plugin to let the retrospective pass flag it. Core now
    // rejects an async `forwardTo` at construct/add/update (#967), and the only
    // other async-checked callbacks (`decode`/`encodeParams`) are stored wrapped
    // in a sync function, so no async callback can survive into a route's stored
    // config for the retrospective pass to catch. The throw branches of
    // `guardNoAsyncCallbacks` remain covered by the add-with-plugin path and the
    // direct `validators.test.ts` unit test.
  });

  describe("validation enabled after registration", () => {
    beforeEach(() => {
      router = createRouter([{ name: "home", path: "/home" }]);
      router.usePlugin(validationPlugin());
    });

    it("validates navigate route name", () => {
      expect(() => {
        // @ts-expect-error testing runtime validation
        void router.navigate(123);
      }).toThrow(TypeError);
    });

    it("validates getDependenciesApi.set key", () => {
      const deps = getDependenciesApi(router);

      expect(() => {
        // @ts-expect-error testing runtime validation
        deps.set(null, "value");
      }).toThrow(TypeError);
    });

    it("validates getRoutesApi.add routes", async () => {
      await router.start("/home");
      const routes = getRoutesApi(router);

      expect(() => {
        // @ts-expect-error testing runtime validation
        routes.add([{ name: null, path: "/bad" }]);
      }).toThrow();
    });
  });
});
