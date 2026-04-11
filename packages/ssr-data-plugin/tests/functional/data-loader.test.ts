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
      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ title: "Home" });
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
      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("Does not intercept navigate", () => {
    it("should not load data on navigate", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ "users.list": loader }));
      await router.start("/");
      loader.mockClear();

      const state = await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("state.context.data", () => {
    it("should return loaded data for current state", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => Promise.resolve({ page: "home" }),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual({ page: "home" });
    });

    it("should be undefined when no loader matched the route", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => Promise.resolve("profile-data"),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBeUndefined();
    });

    it("should return correct data when reading from getState()", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => Promise.resolve({ page: "home-data" }),
        }),
      );
      await router.start("/");

      const state = router.getState()!;

      expect(state.context.data).toStrictEqual({ page: "home-data" });
    });
  });

  describe("Teardown", () => {
    it("should clean up interceptor on unsubscribe", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({ home: loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.data).toBe("data");

      unsubscribe();
    });
  });

  describe("Loader rejection", () => {
    it("should propagate loader promise rejection through start()", async () => {
      const loader = vi.fn().mockRejectedValue(new Error("load failed"));

      router.usePlugin(ssrDataPluginFactory({ home: loader }));

      await expect(router.start("/")).rejects.toThrow("load failed");
    });
  });

  describe("Teardown removes start interceptor", () => {
    it("should not call loader after unsubscribe on subsequent start()", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({ home: loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);

      router.stop();
      unsubscribe();
      loader.mockClear();

      const freshRouter = createRouter(routes, { defaultRoute: "home" });

      await freshRouter.start("/");

      expect(loader).not.toHaveBeenCalled();

      freshRouter.stop();
    });
  });

  describe("Data type variations", () => {
    it("should handle string data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => Promise.resolve("hello") }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBe("hello");
    });

    it("should handle number data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => Promise.resolve(42) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBe(42);
    });

    it("should handle null data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => Promise.resolve(null) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBeNull();
    });

    it("should handle array data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => Promise.resolve([1, "two", { three: 3 }]),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual([1, "two", { three: 3 }]);
    });

    it("should handle nested object data", async () => {
      const nested = { a: { b: { c: [1, 2] } }, d: null };

      router.usePlugin(
        ssrDataPluginFactory({ home: () => Promise.resolve(nested) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual(nested);
    });
  });

  describe("Prototype pollution safety", () => {
    it("should not match keys inherited from prototype", async () => {
      const proto = { home: vi.fn().mockResolvedValue("hacked") };
      const loaders = Object.create(proto) as DataLoaderMap;

      router.usePlugin(ssrDataPluginFactory(loaders));
      const state = await router.start("/");

      expect(proto.home).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
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
          const state = await clone.start(`/users/${i}`);
          const data = state.context.data;

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
