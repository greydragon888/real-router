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
    it("throws when router has duplicate route names", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "home", path: "/duplicate" },
      ]);

      expect(() => router.usePlugin(validationPlugin())).toThrow();
    });

    it("rolls back validator on retrospective error", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "home", path: "/duplicate" },
      ]);

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

    it("throws TypeError during retrospective when route has async forwardTo callback", () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "about", path: "/about" },
      ]);
      const routes = getRoutesApi(router);

      routes.update("home", {
        // @ts-expect-error testing async forwardTo (not allowed by type)
        forwardTo: async () => "about",
      });

      expect(() => router.usePlugin(validationPlugin())).toThrow(TypeError);
    });
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
