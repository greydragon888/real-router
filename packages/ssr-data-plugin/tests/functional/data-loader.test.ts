import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getSsrDataMode, ssrDataPluginFactory } from "../../src";
import { LoaderTimeout, withTimeout } from "../../src/errors";

import type { DataLoaderFactoryMap, SsrMode } from "../../src";
import type { Router, State } from "@real-router/core";

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

const buildServerState = (
  overrides: Partial<State> & { context?: Record<string, unknown> },
): State => ({
  name: "users.profile",
  params: { id: "42" },
  path: "/users/42",
  transition: {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: [], intersection: "" },
  },
  ...overrides,
  context: overrides.context ?? {},
});

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
        ssrDataPluginFactory(null as unknown as DataLoaderFactoryMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-object loaders", () => {
      expect(() =>
        ssrDataPluginFactory("invalid" as unknown as DataLoaderFactoryMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject undefined loaders", () => {
      expect(() =>
        ssrDataPluginFactory(undefined as unknown as DataLoaderFactoryMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-function, non-object entry values", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: "not-a-function" as unknown as DataLoaderFactoryMap["string"],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("should accept valid loaders", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: () => () => Promise.resolve("data"),
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

      router.usePlugin(ssrDataPluginFactory({ home: () => loader }));
      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ title: "Home" });
    });

    it("should pass route params to the loader", async () => {
      const loader = vi.fn().mockResolvedValue({ name: "Alice" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledWith(
        expect.objectContaining({ id: "42" }),
      );
    });

    it("should call loader on every start() (no caching)", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ home: () => loader }));

      await router.start("/");
      router.stop();
      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("should not load data on start when no loader matches", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("Does not intercept navigate", () => {
    it("should not load data on navigate", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      router.usePlugin(ssrDataPluginFactory({ "users.list": () => loader }));
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
          home: () => () => Promise.resolve({ page: "home" }),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual({ page: "home" });
    });

    it("should be undefined when no loader matched the route", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("profile-data"),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBeUndefined();
    });

    it("should return correct data when reading from getState()", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => () => Promise.resolve({ page: "home-data" }),
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
        ssrDataPluginFactory({ home: () => loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.data).toBe("data");

      unsubscribe();
      router.stop();
      loader.mockClear();

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });

    it("should release namespace claim on unsubscribe", async () => {
      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({ home: () => () => Promise.resolve("data") }),
      );

      await router.start("/");
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();
    });
  });

  describe("Loader rejection", () => {
    it("should propagate loader promise rejection through start()", async () => {
      const loader = vi.fn().mockRejectedValue(new Error("load failed"));

      router.usePlugin(ssrDataPluginFactory({ home: () => loader }));

      await expect(router.start("/")).rejects.toThrow("load failed");
    });
  });

  describe("Teardown removes start interceptor", () => {
    it("should not call loader after stop+unsubscribe on subsequent start()", async () => {
      const loader = vi.fn().mockResolvedValue("data");

      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({ home: () => loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);

      router.stop();
      unsubscribe();
      loader.mockClear();

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("Data type variations", () => {
    it("should handle string data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => () => Promise.resolve("hello") }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBe("hello");
    });

    it("should handle number data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => () => Promise.resolve(42) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBe(42);
    });

    it("should handle null data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({ home: () => () => Promise.resolve(null) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toBeNull();
    });

    it("should handle array data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: () => () => Promise.resolve([1, "two", { three: 3 }]),
        }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual([1, "two", { three: 3 }]);
    });

    it("should handle nested object data", async () => {
      const nested = { a: { b: { c: [1, 2] } }, d: null };

      router.usePlugin(
        ssrDataPluginFactory({ home: () => () => Promise.resolve(nested) }),
      );
      const state = await router.start("/");

      expect(state.context.data).toStrictEqual(nested);
    });
  });

  describe("subscribe() timing (documenting limitation)", () => {
    it("state.context.data is undefined in subscribe callback (by design)", async () => {
      let subscribeData: unknown = "sentinel";

      router.subscribe(({ route }) => {
        subscribeData = route.context.data;
      });

      router.usePlugin(
        ssrDataPluginFactory({
          home: () => () => Promise.resolve("loaded"),
        }),
      );

      const state = await router.start("/");

      expect(subscribeData).toBeUndefined();
      expect(state.context.data).toBe("loaded");
    });
  });

  describe("Factory compilation errors", () => {
    it("should release claim when factory throws during compilation", () => {
      const factory = ssrDataPluginFactory({
        home: () => {
          throw new Error("factory crash");
        },
      });

      expect(() => router.usePlugin(factory)).toThrow("factory crash");

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();
    });

    it("should throw when factory returns non-function", () => {
      const factory = ssrDataPluginFactory({
        home: (() =>
          "not-a-function") as unknown as DataLoaderFactoryMap[string],
      });

      expect(() => router.usePlugin(factory)).toThrow(
        '[@real-router/ssr-data-plugin] factory for route "home" must return a function',
      );
    });

    it("should release claim when factory returns non-function", () => {
      const factory = ssrDataPluginFactory({
        home: (() => 42) as unknown as DataLoaderFactoryMap[string],
      });

      expect(() => router.usePlugin(factory)).toThrow();

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();
    });
  });

  describe("Validation — arrays", () => {
    it("should reject array loaders", () => {
      expect(() =>
        ssrDataPluginFactory([] as unknown as DataLoaderFactoryMap),
      ).toThrow(
        "[@real-router/ssr-data-plugin] loaders must be a non-null object",
      );
    });
  });

  describe("getDependency integration", () => {
    it("should pass working getDependency to loader factory", async () => {
      const mockDatabase = { query: vi.fn().mockReturnValue("result") };
      const depRouter = createRouter(
        routes,
        { defaultRoute: "home" },
        { db: mockDatabase },
      );

      depRouter.usePlugin(
        ssrDataPluginFactory({
          home: (_router, getDep) => {
            const database = (getDep as (k: string) => typeof mockDatabase)(
              "db",
            );

            return async () => database.query("SELECT 1");
          },
        }),
      );

      const state = await depRouter.start("/");

      expect(state.context.data).toBe("result");
      expect(mockDatabase.query).toHaveBeenCalledWith("SELECT 1");

      depRouter.stop();
    });

    it("should pass router instance to loader factory", async () => {
      let receivedRouter: unknown;

      router.usePlugin(
        ssrDataPluginFactory({
          home: (r) => {
            receivedRouter = r;

            return async () => "data";
          },
        }),
      );

      await router.start("/");

      expect(receivedRouter).toBe(router);
    });
  });

  describe("Prototype pollution safety", () => {
    it("should not match keys inherited from prototype", async () => {
      const factory = vi
        .fn()
        .mockReturnValue(vi.fn().mockResolvedValue("hacked"));
      const proto = { home: factory };
      const loaders = Object.create(proto) as DataLoaderFactoryMap;

      router.usePlugin(ssrDataPluginFactory(loaders));
      const state = await router.start("/");

      expect(factory).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("Post-hydration loader skip (#596)", () => {
    it("skips loader when hydrated state contains the namespace value", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "client-loader" });
      const serverData = { from: "server-loader", id: "42" };

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const serverState = buildServerState({ context: { data: serverData } });
      const json = serializeRouterState(serverState);

      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toStrictEqual(serverData);
    });

    it("preserves nested data deeply on hydration write", async () => {
      const loader = vi.fn();
      const serverData = {
        user: { id: "42", profile: { name: "Alice", tags: ["a", "b"] } },
        meta: { fetchedAt: 123, nullField: null },
      };

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const json = serializeRouterState(
        buildServerState({ context: { data: serverData } }),
      );

      const state = await hydrateRouter(router, json);

      expect(state.context.data).toStrictEqual(serverData);
    });

    it("runs loader when hydrated state has no `data` namespace", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "client" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const json = serializeRouterState(buildServerState({ context: {} }));
      const state = await hydrateRouter(router, json);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ from: "client" });
    });

    it("runs loader when hydrated state is for a different route", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "client" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      // Server state names route "home", client navigates to /users/42 (mismatch).
      const json = serializeRouterState(
        buildServerState({
          name: "home",
          path: "/users/42",
          context: { data: { from: "stale-server" } },
        }),
      );

      const state = await hydrateRouter(router, json);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ from: "client" });
    });

    it("runs loader on subsequent start() after a hydration cycle", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "csr" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const serverState = buildServerState({
        context: { data: { from: "server" } },
      });
      const json = serializeRouterState(serverState);

      await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();

      router.stop();
      const next = await router.start("/users/99");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(loader).toHaveBeenCalledWith({ id: "99" });
      expect(next.context.data).toStrictEqual({ from: "csr" });
    });

    it("treats explicit `data: undefined` in hydrated context as missing", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "client" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      // hasOwnProperty("data") is true, but value is undefined — still skip
      // (server explicitly serialized `data: undefined` is impossible via JSON,
      // but a sloppy programmatic state could). Accept either semantics; we
      // currently use hasOwnProperty so loader is skipped.
      const serverState = buildServerState({
        context: { data: undefined },
      });

      const state = await hydrateRouter(router, serverState);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
    });
  });

  describe("Stress", () => {
    it("handles concurrent clone+start+dispose cycles with per-request isolation", async () => {
      const N = 500;
      const base = createRouter(routes, { defaultRoute: "home" });
      const loaders: DataLoaderFactoryMap = {
        "users.profile": () => (params) => Promise.resolve({ id: params.id }),
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

  describe("Per-route SSR mode", () => {
    it("object form ssr: 'full' runs loader and writes mode='full'", async () => {
      const loader = vi.fn().mockResolvedValue({ ok: 1 });

      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "full", loader: () => loader },
        }),
      );

      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ ok: 1 });
      expect(getSsrDataMode(state)).toBe("full");
    });

    it("object form ssr: 'data-only' runs loader and writes mode='data-only'", async () => {
      const loader = vi.fn().mockResolvedValue({ payload: 42 });

      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "data-only", loader: () => loader },
        }),
      );

      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ payload: 42 });
      expect(getSsrDataMode(state)).toBe("data-only");
    });

    it("object form ssr: 'client-only' skips loader and writes mode='client-only'", async () => {
      const loader = vi.fn().mockResolvedValue({ skipped: true });

      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "client-only", loader: () => loader },
        }),
      );

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("client-only");
    });

    it("ssr: true → 'full'; ssr: false → 'client-only'", async () => {
      const loaderTrue = vi.fn().mockResolvedValue("a");
      const loaderFalse = vi.fn().mockResolvedValue("b");

      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: true, loader: () => loaderTrue },
          "users.profile": { ssr: false, loader: () => loaderFalse },
        }),
      );

      const home = await router.start("/");

      expect(loaderTrue).toHaveBeenCalledTimes(1);
      expect(getSsrDataMode(home)).toBe("full");

      router.stop();
      const profile = await router.start("/users/1");

      expect(loaderFalse).not.toHaveBeenCalled();
      expect(profile.context.data).toBeUndefined();
      expect(getSsrDataMode(profile)).toBe("client-only");
    });

    it("object form without loader writes mode but no data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "data-only" },
        }),
      );

      const state = await router.start("/");

      expect(state.context.data).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("data-only");
    });

    it("function-form resolver is called once per start() with the resolved state", async () => {
      const resolver = vi.fn<(state: State) => SsrMode>(() => "full");
      const loader = vi.fn().mockResolvedValue("x");

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: resolver, loader: () => loader },
        }),
      );

      const state = await router.start("/users/42");

      expect(resolver).toHaveBeenCalledTimes(1);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "users.profile",
          params: expect.objectContaining({ id: "42" }),
        }),
      );
      expect(state.context.data).toBe("x");
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("function-form resolver returning invalid mode rejects start() and writes nothing", async () => {
      const loader = vi.fn();

      router.usePlugin(
        ssrDataPluginFactory({
          home: {
            ssr: () => "bogus" as unknown as SsrMode,
            loader: () => loader,
          },
        }),
      );

      await expect(router.start("/")).rejects.toThrow(
        '[@real-router/ssr-data-plugin] mode "bogus" is not allowed for route "home"',
      );

      expect(loader).not.toHaveBeenCalled();
      expect(router.getState()?.context.data).toBeUndefined();
      expect(router.getState()?.context.ssrDataMode).toBeUndefined();
    });

    it("function-form resolver throws → start() rejects, no mode/data written", async () => {
      const loader = vi.fn();

      router.usePlugin(
        ssrDataPluginFactory({
          home: {
            ssr: () => {
              throw new Error("resolver-boom");
            },
            loader: () => loader,
          },
        }),
      );

      await expect(router.start("/")).rejects.toThrow("resolver-boom");

      expect(loader).not.toHaveBeenCalled();
      expect(router.getState()?.context.data).toBeUndefined();
      expect(router.getState()?.context.ssrDataMode).toBeUndefined();
    });

    it("validation rejects unknown keys", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: {
            ssr: "full",
            garbage: 1,
          } as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] unexpected key "garbage" in route "home" config',
      );
    });

    it("validation rejects non-function loader in object form", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: {
            loader: "x",
          } as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] loader for route "home" must be a function',
      );
    });

    it("validation rejects wrong ssr type (number)", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: { ssr: 42 } as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] ssr for route "home" must be SsrMode string, boolean, or (state) => SsrMode',
      );
    });

    it("validation rejects unknown mode string", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: {
            ssr: "bogus",
          } as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] mode "bogus" is not allowed for route "home". Allowed: full, data-only, client-only',
      );
    });

    it("validation rejects null entry", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: null as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("validation rejects array entry", () => {
      expect(() =>
        ssrDataPluginFactory({
          home: [] as unknown as DataLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/ssr-data-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("getSsrDataMode falls back to 'full' for routes without plugin entry", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("x"),
        }),
      );

      const state = await router.start("/");

      expect(state.context.ssrDataMode).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("full");
    });

    it("teardown releases both 'data' and 'ssrDataMode' namespace claims", async () => {
      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "full", loader: () => () => Promise.resolve("data") },
        }),
      );

      await router.start("/");
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();
      expect(() =>
        getPluginApi(router).claimContextNamespace("ssrDataMode"),
      ).not.toThrow();
    });

    it("releases 'data' namespace when 'ssrDataMode' is already claimed", () => {
      const blockingClaim =
        getPluginApi(router).claimContextNamespace("ssrDataMode");

      expect(() =>
        router.usePlugin(
          ssrDataPluginFactory({ home: () => () => Promise.resolve(1) }),
        ),
      ).toThrow(/already claimed/);

      // Both namespaces should remain claim-able / claimed predictably:
      // - 'data' must have been released before the throw
      // - 'ssrDataMode' is still held by the manual blockingClaim
      expect(() =>
        getPluginApi(router).claimContextNamespace("data"),
      ).not.toThrow();

      blockingClaim.release();
    });

    it("prototype pollution: object-form on prototype is ignored", async () => {
      const loader = vi.fn().mockResolvedValue("hacked");
      const proto: DataLoaderFactoryMap = {
        home: { ssr: "client-only", loader: () => loader },
      };
      const loaders = Object.create(proto) as DataLoaderFactoryMap;

      router.usePlugin(ssrDataPluginFactory(loaders));
      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
      expect(state.context.ssrDataMode).toBeUndefined();
    });
  });

  describe("Per-route SSR mode + hydration (#596 composition)", () => {
    it("hydration + ssr: 'full' → loader skipped, mode='full' written", async () => {
      const loader = vi.fn();
      const serverData = { from: "server" };

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: "full", loader: () => loader },
        }),
      );

      const json = serializeRouterState(
        buildServerState({ context: { data: serverData } }),
      );
      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toStrictEqual(serverData);
      expect(getSsrDataMode(state)).toBe("full");
    });

    it("hydration + ssr: 'data-only' → loader skipped, mode='data-only' written", async () => {
      const loader = vi.fn();
      const serverData = { from: "server-data-only" };

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: "data-only", loader: () => loader },
        }),
      );

      const json = serializeRouterState(
        buildServerState({ context: { data: serverData } }),
      );
      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toStrictEqual(serverData);
      expect(getSsrDataMode(state)).toBe("data-only");
    });

    it("hydration + ssr: 'client-only' (no server data) → loader skipped, mode='client-only'", async () => {
      const loader = vi.fn().mockResolvedValue("client");

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: "client-only", loader: () => loader },
        }),
      );

      const json = serializeRouterState(buildServerState({ context: {} }));
      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("client-only");
    });

    it("inconsistent server config (mode='client-only' but data present) → mode wins, scratchpad ignored", async () => {
      const loader = vi.fn();

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: "client-only", loader: () => loader },
        }),
      );

      const json = serializeRouterState(
        buildServerState({
          context: { data: { from: "stale-server" }, ssrDataMode: "full" },
        }),
      );
      const state = await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBeUndefined();
      expect(getSsrDataMode(state)).toBe("client-only");
    });
  });

  describe("Module augmentation visibility (type-level)", () => {
    it("state.context.ssrDataMode is typed as SsrMode | undefined", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          home: { ssr: "data-only" },
        }),
      );

      const state = await router.start("/");
      const mode: SsrMode | undefined = state.context.ssrDataMode;

      expect(mode).toBe("data-only");
    });
  });

  describe("withTimeout (#598)", () => {
    it("invokes the loader with { signal: AbortSignal }", async () => {
      let received: AbortSignal | undefined;

      const value = await withTimeout("r", 1000, ({ signal }) => {
        received = signal;

        return Promise.resolve(42);
      });

      expect(value).toBe(42);
      expect(received).toBeInstanceOf(AbortSignal);
      expect(received?.aborted).toBe(false);
    });

    it("aborts the signal before the race rejects on timeout", async () => {
      const abortSpy = vi.fn();
      let signalRef: AbortSignal | undefined;

      const promise = withTimeout(
        "slow",
        20,
        ({ signal }) =>
          new Promise<never>((_, reject) => {
            signalRef = signal;
            signal.addEventListener("abort", () => {
              abortSpy();
              reject(new Error("loader-saw-abort"));
            });
          }),
      );

      await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);

      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(signalRef?.aborted).toBe(true);
      expect(signalRef?.reason).toBeInstanceOf(LoaderTimeout);
    });

    it("fail-fasts when upstreamSignal is already aborted (no loader, no timer)", async () => {
      vi.useFakeTimers();
      try {
        const upstream = new AbortController();

        upstream.abort(new Error("pre-aborted"));

        const loaderSpy = vi.fn();

        await expect(
          withTimeout("r", 1000, loaderSpy, {
            upstreamSignal: upstream.signal,
          }),
        ).rejects.toThrow("pre-aborted");

        expect(loaderSpy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("upstream wins composed race (rejects with loader's error, not LoaderTimeout)", async () => {
      const upstream = new AbortController();

      const promise = withTimeout(
        "r",
        5000,
        ({ signal }) =>
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new DOMException("aborted-by-upstream", "AbortError"));
            });
          }),
        { upstreamSignal: upstream.signal },
      );

      setTimeout(() => {
        upstream.abort();
      }, 20);

      await expect(promise).rejects.toMatchObject({
        name: "AbortError",
        message: "aborted-by-upstream",
      });
    });

    it("timeout wins composed race (LoaderTimeout) when upstream stays alive", async () => {
      const upstream = new AbortController();

      const promise = withTimeout(
        "r",
        20,
        ({ signal }) =>
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("loader-saw-abort"));
            });
          }),
        { upstreamSignal: upstream.signal },
      );

      await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);
      expect(upstream.signal.aborted).toBe(false);
    });

    it("clears the timer when the loader settles early (no setTimeout leak)", async () => {
      vi.useFakeTimers();
      try {
        let timersAfterSettle = -1;

        const promise = withTimeout("r", 10_000, () => Promise.resolve("ok"));

        await promise.then(() => {
          timersAfterSettle = vi.getTimerCount();
        });

        expect(timersAfterSettle).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not produce unhandledRejection when the loader settles late", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (err: unknown) => unhandled.push(err);

      process.on("unhandledRejection", onUnhandled);

      try {
        const promise = withTimeout(
          "r",
          20,
          () =>
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error("late-loader-rejection"));
              }, 100);
            }),
        );

        await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);

        // Wait long enough for the loader's late rejection to settle.
        await new Promise<void>((resolve) => setTimeout(resolve, 150));

        expect(unhandled).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });
});
