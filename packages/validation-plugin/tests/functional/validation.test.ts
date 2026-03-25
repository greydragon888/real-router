import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouter } from "@real-router/core";
import {
  getRoutesApi,
  getDependenciesApi,
  getPluginApi,
} from "@real-router/core/api";
import { validationPlugin } from "../../src";

import type { Router } from "@real-router/core";

let router: Router;

describe("validation-plugin — representative validation tests", () => {
  beforeEach(async () => {
    router = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "users",
          path: "/users",
          children: [{ name: "view", path: "/:id" }],
        },
      ],
      { defaultRoute: "home" },
    );
    router.usePlugin(validationPlugin());
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("navigate() input validation", () => {
    it("should throw TypeError for non-string route name", () => {
      expect(() => {
        // @ts-expect-error testing runtime validation
        void router.navigate(123);
      }).toThrow(TypeError);
    });

    it("should throw TypeError for null route name", () => {
      expect(() => {
        // @ts-expect-error testing runtime validation
        void router.navigate(null);
      }).toThrow(TypeError);
    });

    it("should accept valid route name", () => {
      expect(() => {
        void router.navigate("home");
      }).not.toThrow();
    });
  });

  describe("buildPath() input validation", () => {
    it("should throw TypeError when route is undefined", () => {
      expect(() => {
        router.buildPath(undefined as unknown as string);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when route is null", () => {
      expect(() => {
        router.buildPath(null as unknown as string);
      }).toThrow(TypeError);
    });

    it("should accept valid route name", () => {
      expect(router.buildPath("home")).toBe("/home");
    });
  });

  describe("addRoute() input validation", () => {
    it("should throw when route name is empty string", () => {
      const routesApi = getRoutesApi(router);
      expect(() => {
        routesApi.add({ name: "", path: "/empty" });
      }).toThrow();
    });

    it("should throw on duplicate route name", () => {
      const routesApi = getRoutesApi(router);
      expect(() => {
        routesApi.add({ name: "home", path: "/home-dup" });
      }).toThrow();
    });
  });

  describe("matchPath() input validation", () => {
    it("should throw TypeError for null path", () => {
      expect(() => {
        getPluginApi(router).matchPath(null as unknown as string);
      }).toThrow(TypeError);
    });

    it("should accept valid path", () => {
      expect(() => {
        getPluginApi(router).matchPath("/home");
      }).not.toThrow();
    });
  });

  describe("subscribe() input validation", () => {
    it("should accept valid listener", () => {
      expect(() => {
        router.subscribe(() => {});
      }).not.toThrow();
    });
  });

  describe("limits validation", () => {
    it("should enforce plugin limit when plugin is registered", () => {
      const r = createRouter([], { limits: { maxPlugins: 3 } });
      r.usePlugin(validationPlugin());

      expect(() => {
        r.usePlugin(() => ({}));
        r.usePlugin(() => ({}));
      }).not.toThrow();

      expect(() => {
        r.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it("should accept valid limits config", () => {
      expect(() => {
        const r = createRouter([], { limits: { maxPlugins: 10 } });
        r.usePlugin(validationPlugin());
      }).not.toThrow();
    });
  });

  describe("getDependenciesApi() validation", () => {
    it("should throw TypeError for invalid dependency name", () => {
      const deps = getDependenciesApi(router);
      expect(() => {
        // @ts-expect-error testing runtime validation
        deps.set(123, "value");
      }).toThrow(TypeError);
    });

    it("should accept valid dependency", () => {
      const deps = getDependenciesApi<{ myService: string }>(
        router as Parameters<
          typeof getDependenciesApi<{ myService: string }>
        >[0],
      );
      expect(() => {
        deps.set("myService", "value");
      }).not.toThrow();
    });
  });
});
