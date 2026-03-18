import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { ssrDataPluginFactory } from "../../src";

import type { DataLoaderMap } from "../../src";
import type { Router } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
];

describe("@real-router/ssr-data-plugin", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  describe("Validation", () => {
    it("should reject null loaders", () => {
      expect(() =>
        ssrDataPluginFactory(null as unknown as DataLoaderMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-object loaders", () => {
      expect(() =>
        ssrDataPluginFactory("invalid" as unknown as DataLoaderMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject undefined loaders", () => {
      expect(() =>
        ssrDataPluginFactory(undefined as unknown as DataLoaderMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-function loader values", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: "not-a-function" as unknown as DataLoaderMap["string"],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] loader for route "home" must be a function',
      );
    });

    it("should accept valid loaders", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: () => Promise.resolve("data"),
        }),
      ).not.toThrow();
    });

    it("should accept empty loaders object", () => {
      expect(() => ssrDataPluginFactory({})).not.toThrow();
    });
  });

  describe("Start Interceptor", () => {
    it("should load data on start for matching route", async () => {
      const loader = vi.fn().mockResolvedValue({ title: "Home" });

      router.usePlugin(ssrDataPluginFactory({ home: loader }));
      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getRouteData()).toStrictEqual({ title: "Home" });
    });

    it("should pass route params to the loader", async () => {
      const loader = vi.fn().mockResolvedValue({ name: "Alice" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": loader }));
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledWith(
        expect.objectContaining({ id: "42" }),
      );
    });

    it("should not load data on start when no loader matches", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": loader }));
      await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(router.getRouteData()).toBeNull();
    });
  });

  describe("Does not intercept navigate", () => {
    it("should not load data on navigate", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ "users.list": loader }));
      await router.start("/");
      loader.mockClear();

      await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
      expect(router.getRouteData()).toBeNull();
    });
  });

  describe("getRouteData()", () => {
    it("should return loaded data for current state", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => Promise.resolve({ page: "home" }),
        }),
      );
      await router.start("/");

      expect(router.getRouteData()).toStrictEqual({ page: "home" });
    });

    it("should return null when no loader matched the route", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => Promise.resolve("profile-data"),
        }),
      );
      await router.start("/");

      expect(router.getRouteData()).toBeNull();
    });

    it("should return null when router has no state", () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => Promise.resolve("data") }),
      );

      expect(router.getRouteData()).toBeNull();
    });
  });

  describe("Teardown", () => {
    it("should clean up interceptor and extension on unsubscribe", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({ home: loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getRouteData()).toBe("data");

      unsubscribe();

      expect(router).not.toHaveProperty("getRouteData");
    });
  });

  describe("Stress", () => {
    it("handles concurrent clone+start+dispose cycles with per-request isolation", async () => {
      const N = 500;
      const base = createRouter(routes, { defaultRoute: "home" });
      const loaders: DataLoaderMap = {
        "users.profile": (params) => Promise.resolve({ id: params.id }),
      };

      const results = await Promise.all(
        Array.from({ length: N }, async (_, i) => {
          const clone = cloneRouter(base);

          clone.usePlugin(ssrDataPluginFactory(loaders));
          await clone.start(`/users/${i}`);
          const data = clone.getRouteData();

          clone.dispose();

          return data;
        }),
      );

      for (let i = 0; i < N; i++) {
        expect(results[i]).toStrictEqual({ id: String(i) });
      }
    });
  });
});
