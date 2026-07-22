import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  defer,
  getSsrDataMode,
  invalidate,
  ssrDataPluginFactory,
} from "../../src";
import { LoaderTimeout, withTimeout } from "../../src/errors";
import { markStale } from "../../src/shared-ssr";
import {
  __resetRegistryForTests,
  ensureRegistryPromise,
} from "../../src/shared-ssr/deferRegistryClient";
import { getDeferBootstrapScript } from "../../src/shared-ssr/deferWireFormat";

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
  search: {},
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

    it("runs the loader instead of crashing when the hydration source has no context (#762)", async () => {
      const loader = vi.fn().mockResolvedValue({ from: "client" });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      // Hand-built partial source: `name` matches the resolved route (so the
      // interceptor reaches the namespace lookup) but there is NO `context`.
      // hydrateRouter's `{ path: string }` object-source type accepts it and
      // casts to SerializedRouterState with no runtime validation, so this is
      // reachable from the public API. Before the fix,
      // `config.namespace in hydrationState.context` threw a bare
      // `TypeError: Cannot use 'in' operator to search for 'data' in undefined`.
      const partialSource = {
        name: "users.profile",
        params: { id: "42" },
        path: "/users/42",
      };

      const state = await hydrateRouter(router, partialSource);

      // No context → treat as "no hydrated data" → run the loader gracefully.
      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toStrictEqual({ from: "client" });
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
      // `resolveMode` throws AFTER `next()` committed, so post-#763 the
      // router stays started and `getState()` returns the committed state
      // (no rollback — the observed success is not retracted). The loader
      // never ran and `modeClaim.write` never reached, so both context
      // fields stay undefined; the `?.` is now defensive, not load-bearing.
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

  describe("getSsrDataMode runtime guard against TS-cast bypass", () => {
    const stateWith = (ssrDataMode: unknown): State => ({
      name: "users.profile",
      params: { id: "42" },
      search: {},
      path: "/users/42",
      transition: {
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated: [], intersection: "" },
      },
      context: { ssrDataMode } as Record<string, unknown>,
    });

    it("returns 'full' for ssrDataMode === undefined (route without entry)", () => {
      expect(getSsrDataMode(stateWith(undefined))).toBe("full");
    });

    it("returns 'full' for ssrDataMode === null (foreign-writer garbage)", () => {
      expect(getSsrDataMode(stateWith(null))).toBe("full");
    });

    it("returns 'full' for ssrDataMode === 0 (falsy non-nullish bypass)", () => {
      expect(getSsrDataMode(stateWith(0))).toBe("full");
    });

    it("returns 'full' for ssrDataMode === false (boolean bypass)", () => {
      expect(getSsrDataMode(stateWith(false))).toBe("full");
    });

    it("returns 'full' for ssrDataMode === '' (empty string bypass)", () => {
      expect(getSsrDataMode(stateWith(""))).toBe("full");
    });

    it("returns 'full' for ssrDataMode === 'bogus' (foreign mode string)", () => {
      expect(getSsrDataMode(stateWith("bogus"))).toBe("full");
    });

    it("preserves the value for ssrDataMode === 'full'", () => {
      expect(getSsrDataMode(stateWith("full"))).toBe("full");
    });

    it("preserves the value for ssrDataMode === 'data-only'", () => {
      expect(getSsrDataMode(stateWith("data-only"))).toBe("data-only");
    });

    it("preserves the value for ssrDataMode === 'client-only'", () => {
      expect(getSsrDataMode(stateWith("client-only"))).toBe("client-only");
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
      // Pin signalRef to a real AbortSignal first: without this, a regression
      // where the loader never sees `{ signal }` (signalRef stays undefined)
      // would still pass the `?.aborted === true` short-circuit (`undefined`
      // would just stay falsy and the assertion never asks for `true`).
      expect(signalRef).toBeInstanceOf(AbortSignal);
      expect(signalRef!.aborted).toBe(true);
      expect(signalRef!.reason).toBeInstanceOf(LoaderTimeout);
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

  describe("invalidate(router, 'data') — CSR revalidation", () => {
    it("re-runs loader for the destination route on the next navigation after invalidate()", async () => {
      const homeLoader = vi.fn().mockResolvedValue({ page: "home-v1" });
      const listLoader = vi.fn().mockResolvedValue({ page: "list-v1" });

      router.usePlugin(
        ssrDataPluginFactory({
          home: () => homeLoader,
          "users.list": () => listLoader,
        }),
      );

      await router.start("/");

      expect(homeLoader).toHaveBeenCalledTimes(1);
      expect(listLoader).not.toHaveBeenCalled();

      // CSR navigation alone does NOT re-run the loader.
      await router.navigate("users.list");

      expect(listLoader).not.toHaveBeenCalled();
      expect(router.getState()!.context.data).toBeUndefined();

      // After invalidate(), the next navigation re-runs the loader for the
      // *destination* route — even when navigating away to a different route.
      listLoader.mockResolvedValueOnce({ page: "list-v2" });
      invalidate(router, "data");
      await router.navigate("users.list", {}, undefined, { reload: true });

      expect(listLoader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.data).toStrictEqual({
        page: "list-v2",
      });
    });

    it("re-runs loader on a same-route reload (the canonical revalidation pattern)", async () => {
      let counter = 0;
      const loader = vi.fn().mockImplementation(() => {
        counter += 1;

        return Promise.resolve({ value: counter });
      });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      await router.start("/users/42");

      expect(router.getState()!.context.data).toStrictEqual({ value: 1 });

      invalidate(router, "data");
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.data).toStrictEqual({ value: 2 });
    });

    it("is idempotent — multiple invalidate() calls before the next navigation collapse to one re-run", async () => {
      const loader = vi.fn().mockResolvedValue({ v: 1 });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");
      loader.mockClear();

      invalidate(router, "data");
      invalidate(router, "data");
      invalidate(router, "data");

      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("preserves the flag when navigation lands on a route without an entry — next entry-route nav refreshes", async () => {
      const homeLoader = vi.fn().mockResolvedValue("home");

      router.usePlugin(ssrDataPluginFactory({ home: () => homeLoader }));
      await router.start("/");
      homeLoader.mockClear();

      invalidate(router, "data");

      // users.list has no entry — leave handler is a no-op, flag preserved.
      const intermediate = await router.navigate("users.list");

      expect(homeLoader).not.toHaveBeenCalled();
      expect(intermediate.context.data).toBeUndefined();

      // Now reach a route with an entry — flag is consumed, loader runs.
      await router.navigate("home");

      expect(homeLoader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.data).toBe("home");
    });

    it("writes the mode marker but skips the loader when the destination route resolves to client-only", async () => {
      const loader = vi.fn().mockResolvedValue("never");

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: false, loader: () => loader },
        }),
      );
      await router.start("/");

      invalidate(router, "data");
      const state = await router.navigate("users.profile", { id: "42" });

      expect(loader).not.toHaveBeenCalled();
      expect(getSsrDataMode(state)).toBe("client-only");
      expect(state.context.data).toBeUndefined();
    });

    it("writes the mode marker even when the entry has no loader (mode-only entry)", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": { ssr: "data-only" },
        }),
      );
      await router.start("/");

      invalidate(router, "data");
      const state = await router.navigate("users.profile", { id: "42" });

      expect(getSsrDataMode(state)).toBe("data-only");
      expect(state.context.data).toBeUndefined();
    });

    it("supports function-form ssr resolver — re-evaluated per navigation", async () => {
      const loader = vi.fn().mockResolvedValue({ ok: true });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": {
            ssr: (s) => (s.params.id === "1" ? "client-only" : "full"),
            loader: () => loader,
          },
        }),
      );
      await router.start("/users/2");
      loader.mockClear();

      invalidate(router, "data");
      const state1 = await router.navigate("users.profile", { id: "1" });

      expect(loader).not.toHaveBeenCalled();
      expect(getSsrDataMode(state1)).toBe("client-only");

      invalidate(router, "data");
      const state2 = await router.navigate(
        "users.profile",
        { id: "2" },
        undefined,
        { reload: true },
      );

      expect(loader).toHaveBeenCalledTimes(1);
      expect(getSsrDataMode(state2)).toBe("full");
      expect(state2.context.data).toStrictEqual({ ok: true });
    });

    it("propagates loader rejection through the navigation that consumes the flag", async () => {
      const loader = vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error("boom"));

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      invalidate(router, "data");

      await expect(
        router.navigate("users.profile", { id: "42" }, undefined, {
          reload: true,
        }),
      ).rejects.toThrow("boom");
    });

    it("flag is consumed after one navigation — the navigation after that does not re-run the loader", async () => {
      const loader = vi.fn().mockResolvedValue({ v: 1 });

      router.usePlugin(
        ssrDataPluginFactory({
          home: () => loader,
          "users.list": () => loader,
        }),
      );
      await router.start("/");
      loader.mockClear();

      invalidate(router, "data");

      await router.navigate("users.list");

      expect(loader).toHaveBeenCalledTimes(1);

      // No new invalidate() — the next nav must NOT re-run the loader.
      await router.navigate("home");

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("teardown removes the leave listener — invalidate() after unsubscribe is a no-op", async () => {
      const loader = vi.fn().mockResolvedValue({ v: 1 });
      const unsubscribe = router.usePlugin(
        ssrDataPluginFactory({
          home: () => loader,
          "users.list": () => loader,
        }),
      );

      await router.start("/");
      loader.mockClear();
      unsubscribe();

      invalidate(router, "data");
      await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
    });

    it("preserves the flag when navigation is cancelled mid-loader — next nav refreshes", async () => {
      let releaseSlowLoader: () => void = () => {};
      const slowPromise = new Promise<{ v: number }>((resolve) => {
        releaseSlowLoader = () => {
          resolve({ v: 1 });
        };
      });

      const loader = vi
        .fn()
        .mockImplementationOnce(() => slowPromise)
        .mockResolvedValueOnce({ v: 2 });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/"); // home — no entry, loader not called

      invalidate(router, "data");

      const ac = new AbortController();
      const navA = router.navigate("users.profile", { id: "42" }, undefined, {
        signal: ac.signal,
      });

      // Let the leave handler reach `await loader(…)`.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Cancel A; resolve the awaited loader so the handler completes.
      ac.abort();
      releaseSlowLoader();

      // Pin the error: ac.abort() makes router reject navA with an
      // AbortError-shaped DOMException. A bare `rejects.toThrow()` would
      // accept *any* error — including a regression that lets the loader
      // result silently land on a cancelled state.
      await expect(navA).rejects.toThrow(/cancel|abort/i);

      expect(loader).toHaveBeenCalledTimes(1);

      // Flag preserved — next navigation refreshes from the second mock.
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.data).toStrictEqual({ v: 2 });
    });

    it("does not leak across namespaces — markStale on a foreign namespace is ignored by this plugin", async () => {
      const loader = vi.fn().mockResolvedValue({ v: 1 });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");
      loader.mockClear();

      // Mark a foreign namespace (e.g. what rsc-server-plugin's invalidate
      // would do). The ssr-data-plugin's listener checks "data" — sees no flag.
      markStale(router, "rsc");

      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).not.toHaveBeenCalled();

      // Own namespace still works.
      invalidate(router, "data");
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("preserves the flag when destination is client-only — next entry-with-loader nav refreshes", async () => {
      const homeLoader = vi
        .fn()
        .mockResolvedValueOnce("home-v1")
        .mockResolvedValueOnce("home-v2");
      const profileLoader = vi.fn().mockResolvedValue("never");

      router.usePlugin(
        ssrDataPluginFactory({
          home: () => homeLoader,
          "users.profile": { ssr: false, loader: () => profileLoader },
        }),
      );
      await router.start("/");

      expect(homeLoader).toHaveBeenCalledTimes(1);

      invalidate(router, "data");
      await router.navigate("users.profile", { id: "42" });

      expect(profileLoader).not.toHaveBeenCalled();
      expect(homeLoader).toHaveBeenCalledTimes(1);

      await router.navigate("home");

      expect(homeLoader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.data).toBe("home-v2");
    });

    it("preserves the flag when destination is a mode-only entry (no loader)", async () => {
      const homeLoader = vi
        .fn()
        .mockResolvedValueOnce("home-v1")
        .mockResolvedValueOnce("home-v2");

      router.usePlugin(
        ssrDataPluginFactory({
          home: () => homeLoader,
          "users.profile": { ssr: "data-only" },
        }),
      );
      await router.start("/");

      invalidate(router, "data");
      const profileState = await router.navigate("users.profile", {
        id: "42",
      });

      expect(homeLoader).toHaveBeenCalledTimes(1);
      expect(getSsrDataMode(profileState)).toBe("data-only");

      await router.navigate("home");

      expect(homeLoader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.data).toBe("home-v2");
    });

    it("preserves the flag when loader rejects — retry with succeeding loader refreshes", async () => {
      const loader = vi
        .fn()
        .mockResolvedValueOnce("initial")
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce("recovered");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledTimes(1);

      invalidate(router, "data");

      await expect(
        router.navigate("users.profile", { id: "42" }, undefined, {
          reload: true,
        }),
      ).rejects.toThrow("transient");

      expect(loader).toHaveBeenCalledTimes(2);

      // Flag preserved through rejection — retry refreshes successfully.
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(3);
      expect(router.getState()!.context.data).toBe("recovered");
    });

    it("passes navigation signal as the second loader argument", async () => {
      let observedSignal: AbortSignal | undefined;
      let observedAbortedAtCall: boolean | undefined;

      const loader = vi
        .fn()
        .mockResolvedValueOnce("initial")
        .mockImplementationOnce(
          async (
            _params: unknown,
            ctx: { signal: AbortSignal } | undefined,
          ) => {
            observedSignal = ctx?.signal;
            observedAbortedAtCall = ctx?.signal.aborted;

            return "refreshed";
          },
        );

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      // Start interceptor calls loader without context (SSR boot path).
      // Pinning the full args tuple via `toStrictEqual([{ id: "42" }])` is
      // strictly stronger than `startCallArgs[0]` + `startCallArgs[1]`:
      // it asserts BOTH the params payload AND the arity (single arg, no
      // ctx). The previous shape would have passed even if the start path
      // started leaking a synthetic ctx, as long as it shaped up to
      // `undefined` for `[1]`. Note: `toHaveBeenCalledWith(params, undefined)`
      // would NOT work here — vitest treats `f(x)` and `f(x, undefined)`
      // as distinct by arity, and the start path passes a single argument.
      expect(loader.mock.calls[0]).toStrictEqual([{ id: "42" }]);

      invalidate(router, "data");
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      // Leave handler passes { signal } from the navigation's controller.
      // Capture inside the loader because the controller is aborted during
      // post-completion cleanup (signal.aborted flips to true after the
      // navigation resolves).
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedAbortedAtCall).toBe(false);
    });

    it("loader's signal aborts when navigation is cancelled mid-flight", async () => {
      let capturedSignal: AbortSignal | undefined;
      let releaseSlowLoader: () => void = () => {};
      const slowPromise = new Promise<{ v: number }>((resolve) => {
        releaseSlowLoader = () => {
          resolve({ v: 1 });
        };
      });

      const loader = vi
        .fn()
        .mockImplementationOnce(
          (_params: unknown, ctx: { signal: AbortSignal } | undefined) => {
            capturedSignal = ctx?.signal;

            return slowPromise;
          },
        )
        .mockResolvedValueOnce({ v: 2 });

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/");

      invalidate(router, "data");

      const ac = new AbortController();
      const navA = router.navigate("users.profile", { id: "42" }, undefined, {
        signal: ac.signal,
      });

      // Reach `await loader(...)` in the leave handler.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal?.aborted).toBe(false);

      ac.abort();

      // Navigation cancelled → loader's signal flips to aborted synchronously.
      expect(capturedSignal?.aborted).toBe(true);

      releaseSlowLoader();

      await expect(navA).rejects.toThrow(/cancel|abort/i);

      // Flag preserved because the cancelled nav skipped the write — next
      // navigation refreshes with a fresh, non-aborted signal.
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(router.getState()!.context.data).toStrictEqual({ v: 2 });
    });

    it("supports cancellation-aware loaders that abort early on signal", async () => {
      const loader = vi
        .fn()
        .mockResolvedValueOnce("initial")
        .mockImplementationOnce(
          async (
            _params: unknown,
            ctx: { signal: AbortSignal } | undefined,
          ) => {
            return new Promise<string>((resolve, reject) => {
              const t = setTimeout(() => {
                resolve("late");
              }, 100);

              ctx?.signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(t);
                  reject(new DOMException("aborted", "AbortError"));
                },
                { once: true },
              );
            });
          },
        )
        .mockResolvedValueOnce("recovered");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      invalidate(router, "data");

      const ac = new AbortController();
      const navA = router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
        signal: ac.signal,
      });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      ac.abort();

      // Loader rejects with AbortError; navigation rejects.
      await expect(navA).rejects.toThrow(/cancel|abort/i);

      // Flag preserved (loader rejection bypasses clearStale). Retry
      // succeeds with fresh, non-aborted signal.
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(router.getState()!.context.data).toBe("recovered");
    });

    it("pre-aborted nav signal: leave handler never runs; loader is NOT invoked; stale flag preserved", async () => {
      // CLAUDE.md "Cancellation-aware loaders" documents two distinct cancel
      // surfaces:
      //   1. Mid-flight abort — signal flips DURING the leave handler's
      //      `await entry.loader(...)`. Covered by the two prior tests
      //      (loader receives signal, observes abort via addEventListener,
      //      navigation rejects).
      //   2. Pre-aborted navigation signal — `navigate(..., { signal })` is
      //      called with a signal that's ALREADY aborted at call time. Core
      //      rejects this synchronously with TRANSITION_CANCELLED in the
      //      navigation pipeline (see core's `abort-signal.test.ts` case 1);
      //      the leave handler never runs, so the loader is not invoked.
      //
      // This anchor pins surface (2) for the ssr-data-plugin specifically:
      // a stale flag set BEFORE a pre-aborted navigate() must survive
      // (the cancelled nav doesn't consume it), so a follow-up nav with
      // a fresh signal still refreshes.
      const loader = vi
        .fn()
        .mockResolvedValueOnce("initial")
        .mockResolvedValueOnce("recovered");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledTimes(1);

      invalidate(router, "data");

      const ac = new AbortController();

      ac.abort(new Error("pre-aborted"));

      await expect(
        router.navigate("users.profile", { id: "42" }, undefined, {
          reload: true,
          signal: ac.signal,
        }),
      ).rejects.toThrow(/cancel|abort|pre-aborted/i);

      // Surface (2): leave handler never ran — loader was not invoked a
      // second time. If a future refactor lets pre-aborted nav signals
      // reach the leave handler, this assert would catch it (loader
      // would be called twice).
      expect(loader).toHaveBeenCalledTimes(1);

      // Stale flag preserved across the cancelled navigation — a
      // follow-up nav with a non-aborted signal consumes the flag.
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.data).toBe("recovered");
    });
  });

  describe("defer() — critical/deferred split", () => {
    afterEach(() => {
      __resetRegistryForTests();
    });

    it("writes critical to context.data and promises to context.ssrDataDeferred", async () => {
      const reviewsP = Promise.resolve([{ id: "r1" }]);
      const relatedP = Promise.resolve([{ id: "k1" }]);

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () =>
            defer({
              critical: { product: { id: "42" } },
              deferred: { reviews: reviewsP, related: relatedP },
            }),
        }),
      );

      const state = await router.start("/users/42");

      expect(state.context.data).toStrictEqual({ product: { id: "42" } });
      expect(state.context.ssrDataDeferred).toStrictEqual({
        reviews: reviewsP,
        related: relatedP,
      });
      expect(state.context.ssrDataDeferredKeys).toStrictEqual([
        "reviews",
        "related",
      ]);
      expect(state.context.ssrDataDeferred!.reviews).toBe(reviewsP);
    });

    it("does not touch deferred namespaces when loader returns plain data", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve({ user: "Alice" }),
        }),
      );

      const state = await router.start("/users/42");

      expect(state.context.data).toStrictEqual({ user: "Alice" });
      expect(state.context.ssrDataDeferred).toBeUndefined();
      expect(state.context.ssrDataDeferredKeys).toBeUndefined();
    });

    it("supports empty deferred record", async () => {
      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () =>
            defer({
              critical: { user: "Bob" },
              deferred: {},
            }),
        }),
      );

      const state = await router.start("/users/42");

      expect(state.context.data).toStrictEqual({ user: "Bob" });
      expect(state.context.ssrDataDeferred).toStrictEqual({});
      expect(state.context.ssrDataDeferredKeys).toStrictEqual([]);
    });

    it("reconstructs deferred promises from registry on hydration scratchpad path", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: ["reviews", "related"],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => {
            throw new Error("loader should be skipped after hydration");
          },
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      const state = router.getState()!;

      expect(state.context.data).toStrictEqual({ product: { id: "42" } });
      expect(state.context.ssrDataDeferredKeys).toStrictEqual([
        "reviews",
        "related",
      ]);

      const deferred = state.context.ssrDataDeferred;

      // Reference identity with the registry-backed promise is strictly
      // stronger than `toBeInstanceOf(Promise)` (every registry entry IS a
      // Promise, so the `instanceof` check is implied). The `!.` below also
      // covers the undefined case — no separate `toBeDefined()` needed.
      expect(deferred!.reviews).toBe(ensureRegistryPromise("reviews"));
      expect(deferred!.related).toBe(ensureRegistryPromise("related"));
    });

    it("settles registry-backed promises when bootstrap+settle scripts run", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: ["reviews"],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("never"),
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      const deferred = router.getState()!.context.ssrDataDeferred!;

      // Bootstrap idempotency contract: running the bootstrap script AFTER
      // the plugin populated `ssrDataDeferred` must NOT rebuild the registry
      // — otherwise the just-captured `deferred.reviews` reference would be
      // orphaned (registry would create a fresh promise, and the `settle!`
      // call below would resolve THAT promise, leaving our captured one
      // pending forever). The bootstrap therefore early-returns when
      // `globalThis.__rrDeferRegistry__` already exists, which is what we
      // implicitly rely on here. If a future refactor flips the bootstrap
      // to "always rebuild", this test will hang on the final
      // `await deferred.reviews` — that hang IS the regression signal.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- const bootstrap script
      new Function(getDeferBootstrapScript())();

      const settle = (
        globalThis as {
          __rrDefer__?: (k: string, j: string) => void;
        }
      ).__rrDefer__;

      settle!("reviews", JSON.stringify([{ id: "r1" }]));

      await expect(deferred.reviews).resolves.toStrictEqual([{ id: "r1" }]);
    });

    it("ignores non-array ssrDataDeferredKeys in hydrated state", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: "garbage" as unknown as string[],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("never"),
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      expect(router.getState()!.context.ssrDataDeferred).toBeUndefined();
    });

    it("filters non-string entries in ssrDataDeferredKeys defensively", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: [
            "reviews",
            42,
            null,
            "related",
          ] as unknown as string[],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("never"),
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      const state = router.getState()!;

      // The hydrated value is what the plugin wrote — strings only.
      expect(state.context.ssrDataDeferredKeys).toStrictEqual([
        "reviews",
        "related",
      ]);
      expect(Object.keys(state.context.ssrDataDeferred!)).toStrictEqual([
        "reviews",
        "related",
      ]);
    });

    it("skips deferred reconstruction when keys array is empty", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: [],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("never"),
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      expect(router.getState()!.context.ssrDataDeferred).toBeUndefined();
    });

    it("invalidate + reload re-runs loader and updates deferred promises", async () => {
      const reviewsP1 = Promise.resolve([{ id: "old" }]);
      const reviewsP2 = Promise.resolve([{ id: "new" }]);
      let call = 0;

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => {
            call++;

            return defer({
              critical: { user: "Alice" },
              deferred: { reviews: call === 1 ? reviewsP1 : reviewsP2 },
            });
          },
        }),
      );

      const state = await router.start("/users/42");

      expect(state.context.ssrDataDeferred!.reviews).toBe(reviewsP1);

      invalidate(router, "data");
      await router.navigate("users.profile", { id: "42" }, undefined, {
        reload: true,
      });

      const refreshed = router.getState()!;

      expect(refreshed.context.ssrDataDeferred!.reviews).toBe(reviewsP2);
      expect(call).toBe(2);
    });

    it("filters reserved keys (__proto__, constructor, prototype) during hydration reconstruction", async () => {
      const serverState = buildServerState({
        context: {
          data: { product: { id: "42" } },
          ssrDataMode: "full",
          ssrDataDeferredKeys: [
            "reviews",
            "__proto__",
            "constructor",
            "prototype",
            "related",
          ],
        },
      });

      router.usePlugin(
        ssrDataPluginFactory({
          "users.profile": () => () => Promise.resolve("never"),
        }),
      );

      await hydrateRouter(router, serializeRouterState(serverState));

      const state = router.getState()!;
      const deferred = state.context.ssrDataDeferred!;

      // Only safe keys land in the registry-backed map.
      expect(state.context.ssrDataDeferredKeys).toStrictEqual([
        "reviews",
        "related",
      ]);
      expect(Object.keys(deferred)).toStrictEqual(["reviews", "related"]);

      // Null-prototype object — `then` (would-be Promise.prototype lookup)
      // is undefined, not the inherited function. Same applies to
      // `constructor`, which on a regular `{}` would point to `Object` via
      // the prototype chain — under `Object.create(null)` it's a plain
      // own-property miss (`undefined`), proving the chain really is broken.
      expect(Object.getPrototypeOf(deferred)).toBeNull();
      expect((deferred as Record<string, unknown>).then).toBeUndefined();
      expect((deferred as Record<string, unknown>).constructor).toBeUndefined();
    });

    it("rejects when only one of deferredNamespace / deferredKeysNamespace is configured", async () => {
      // We can't easily call createSsrLoaderPlugin here since factory.ts hardcodes both,
      // so call createSsrLoaderPlugin directly via shared-ssr import.
      const { createSsrLoaderPlugin } =
        await import("../../src/shared-ssr/index.js");

      expect(() =>
        createSsrLoaderPlugin(
          {},
          {
            namespace: "data",
            modeNamespace: "ssrDataMode",
            deferredNamespace: "ssrDataDeferred",
            // missing deferredKeysNamespace
            errorPrefix: "[test]",
          },
        ),
      ).toThrow(/must be set together/);

      expect(() =>
        createSsrLoaderPlugin(
          {},
          {
            namespace: "data",
            modeNamespace: "ssrDataMode",
            deferredKeysNamespace: "ssrDataDeferredKeys",
            // missing deferredNamespace
            errorPrefix: "[test]",
          },
        ),
      ).toThrow(/must be set together/);
    });
  });

  describe("markStale edge cases", () => {
    it("markStale(router, '') is a silent no-op for downstream isStale('data')", async () => {
      // Document the contract: `markStale` does not validate the namespace
      // string. An empty-string namespace successfully lands in the per-
      // router Set (the underlying Set#add accepts any string), but a
      // subsequent `isStale(router, "data")` peek returns `false` — the
      // plugin's `subscribeLeave` listener is keyed on its own namespace
      // and never observes a foreign mark. The shape mirrors the broader
      // per-namespace orthogonality guarantee documented in CLAUDE.md.
      const loader = vi.fn().mockResolvedValue({ page: "v1" });

      router.usePlugin(ssrDataPluginFactory({ home: () => loader }));
      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);

      // A no-op mark — leave-listener gate is "data", not "".
      markStale(router, "");

      // A regular navigation must NOT re-run the loader.
      await router.navigate("home", {}, undefined, { reload: true });

      expect(loader).toHaveBeenCalledTimes(1);
    });
  });
});
