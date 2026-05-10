import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getSsrRscMode, invalidate, rscServerPluginFactory } from "../../src";
import { markStale } from "../../src/shared-ssr";

import type { RscLoaderFactoryMap, RscSsrMode } from "../../src";
import type { Router, State } from "@real-router/core";
import type { ReactNode } from "react";

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

// Plain "ReactNode-like" objects — we test the plumbing, not React itself.
const node = (kind: string, props: Record<string, unknown> = {}): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

describe("@real-router/rsc-server-plugin", () => {
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
        rscServerPluginFactory(null as unknown as RscLoaderFactoryMap),
      ).toThrow(
        "[@real-router/rsc-server-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-object loaders", () => {
      expect(() =>
        rscServerPluginFactory("invalid" as unknown as RscLoaderFactoryMap),
      ).toThrow(
        "[@real-router/rsc-server-plugin] loaders must be a non-null object",
      );
    });

    it("should reject undefined loaders", () => {
      expect(() =>
        rscServerPluginFactory(undefined as unknown as RscLoaderFactoryMap),
      ).toThrow(
        "[@real-router/rsc-server-plugin] loaders must be a non-null object",
      );
    });

    it("should reject non-function, non-object entry values", () => {
      expect(() =>
        rscServerPluginFactory({
          home: "not-a-function" as unknown as RscLoaderFactoryMap["string"],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("should accept valid loaders", () => {
      expect(() =>
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("HomePage")),
        }),
      ).not.toThrow();
    });

    it("should accept empty loaders object", () => {
      expect(() => rscServerPluginFactory({})).not.toThrow();
    });
  });

  describe("Start Interceptor", () => {
    it("should load ReactNode on start for matching route", async () => {
      const homeNode = node("HomePage");
      const loader = vi.fn().mockResolvedValue(homeNode);

      router.usePlugin(rscServerPluginFactory({ home: () => loader }));
      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.rsc).toBe(homeNode);
    });

    it("should pass route params to the loader", async () => {
      const loader = vi
        .fn()
        .mockResolvedValue(node("UserProfile", { id: "42" }));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledWith(
        expect.objectContaining({ id: "42" }),
      );
    });

    it("should call loader on every start() (no caching)", async () => {
      const loader = vi.fn().mockResolvedValue(node("Same"));

      router.usePlugin(rscServerPluginFactory({ home: () => loader }));

      await router.start("/");
      router.stop();
      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("should not load rsc on start when no loader matches", async () => {
      const loader = vi.fn().mockResolvedValue(node("Profile"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
    });
  });

  describe("Does not intercept navigate", () => {
    it("should not load rsc on navigate", async () => {
      const loader = vi.fn().mockResolvedValue(node("Users"));

      router.usePlugin(rscServerPluginFactory({ "users.list": () => loader }));
      await router.start("/");
      loader.mockClear();

      const state = await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
    });
  });

  describe("state.context.rsc", () => {
    it("should return loaded ReactNode for current state", async () => {
      const homeNode = node("HomePage");

      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(homeNode),
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBe(homeNode);
    });

    it("should be undefined when no loader matched the route", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => () => Promise.resolve(node("Profile")),
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBeUndefined();
    });

    it("should return correct rsc when reading from getState()", async () => {
      const homeNode = node("HomePage");

      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(homeNode),
        }),
      );
      await router.start("/");

      const state = router.getState()!;

      expect(state.context.rsc).toBe(homeNode);
    });
  });

  describe("Teardown", () => {
    it("should clean up interceptor on unsubscribe", async () => {
      const loader = vi.fn().mockResolvedValue(node("Home"));

      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({ home: () => loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.rsc).toStrictEqual(node("Home"));

      unsubscribe();
      router.stop();
      loader.mockClear();

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
    });

    it("should release namespace claim on unsubscribe", async () => {
      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("Home")),
        }),
      );

      await router.start("/");
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();
    });
  });

  describe("Loader rejection", () => {
    it("should propagate loader promise rejection through start()", async () => {
      const loader = vi.fn().mockRejectedValue(new Error("rsc render failed"));

      router.usePlugin(rscServerPluginFactory({ home: () => loader }));

      await expect(router.start("/")).rejects.toThrow("rsc render failed");
    });
  });

  describe("Teardown removes start interceptor", () => {
    it("should not call loader after stop+unsubscribe on subsequent start()", async () => {
      const loader = vi.fn().mockResolvedValue(node("Home"));

      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({ home: () => loader }),
      );

      await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);

      router.stop();
      unsubscribe();
      loader.mockClear();

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
    });
  });

  describe("ReactNode variations", () => {
    it("should handle sync element return (no Promise wrap)", async () => {
      const homeNode = node("HomePage");

      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => homeNode, // sync return
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBe(homeNode);
    });

    it("should handle async element return", async () => {
      const homeNode = node("HomePage");

      router.usePlugin(
        rscServerPluginFactory({
          home: () => async () => homeNode,
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBe(homeNode);
    });

    it("should handle null ReactNode", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => null,
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBeNull();
    });

    it("should handle string ReactNode (text node)", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => "hello world",
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toBe("hello world");
    });

    it("should handle array (Fragment-like) ReactNode", async () => {
      const fragment = [node("Header"), node("Body"), node("Footer")];

      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => fragment,
        }),
      );
      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(fragment);
    });
  });

  describe("subscribe() timing (documenting limitation)", () => {
    it("state.context.rsc is undefined in subscribe callback (by design)", async () => {
      let subscribeRsc: unknown = "sentinel";

      router.subscribe(({ route }) => {
        subscribeRsc = route.context.rsc;
      });

      router.usePlugin(
        rscServerPluginFactory({
          home: () => () => Promise.resolve(node("Home")),
        }),
      );

      const state = await router.start("/");

      expect(subscribeRsc).toBeUndefined();
      expect(state.context.rsc).toStrictEqual(node("Home"));
    });
  });

  describe("Factory compilation errors", () => {
    it("should release claim when factory throws during compilation", () => {
      const factory = rscServerPluginFactory({
        home: () => {
          throw new Error("factory crash");
        },
      });

      expect(() => router.usePlugin(factory)).toThrow("factory crash");

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();
    });

    it("should throw when factory returns non-function", () => {
      const factory = rscServerPluginFactory({
        home: (() =>
          "not-a-function") as unknown as RscLoaderFactoryMap[string],
      });

      expect(() => router.usePlugin(factory)).toThrow(
        '[@real-router/rsc-server-plugin] factory for route "home" must return a function',
      );
    });

    it("should release claim when factory returns non-function", () => {
      const factory = rscServerPluginFactory({
        home: (() => 42) as unknown as RscLoaderFactoryMap[string],
      });

      expect(() => router.usePlugin(factory)).toThrow();

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();
    });
  });

  describe("Validation — arrays", () => {
    it("should reject array loaders", () => {
      expect(() =>
        rscServerPluginFactory([] as unknown as RscLoaderFactoryMap),
      ).toThrow(
        "[@real-router/rsc-server-plugin] loaders must be a non-null object",
      );
    });
  });

  describe("getDependency integration", () => {
    it("should pass working getDependency to loader factory", async () => {
      const mockDatabase = {
        query: vi.fn().mockReturnValue(node("Result")),
      };
      const depRouter = createRouter(
        routes,
        { defaultRoute: "home" },
        { db: mockDatabase },
      );

      depRouter.usePlugin(
        rscServerPluginFactory({
          home: (_router, getDep) => {
            const database = (getDep as (k: string) => typeof mockDatabase)(
              "db",
            );

            return async () => database.query("SELECT 1");
          },
        }),
      );

      const state = await depRouter.start("/");

      expect(state.context.rsc).toStrictEqual(node("Result"));
      expect(mockDatabase.query).toHaveBeenCalledWith("SELECT 1");

      depRouter.stop();
    });

    it("should pass router instance to loader factory", async () => {
      let receivedRouter: unknown;

      router.usePlugin(
        rscServerPluginFactory({
          home: (r) => {
            receivedRouter = r;

            return async () => node("Home");
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
        .mockReturnValue(vi.fn().mockResolvedValue(node("Hacked")));
      const proto = { home: factory };
      const loaders = Object.create(proto) as RscLoaderFactoryMap;

      router.usePlugin(rscServerPluginFactory(loaders));
      const state = await router.start("/");

      expect(factory).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
    });
  });

  describe("Post-hydration loader skip (#596)", () => {
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

    it("skips loader when hydrated state contains the rsc namespace value", async () => {
      const loader = vi.fn().mockResolvedValue(node("ClientProfile"));
      // Use a plain object payload (not a ReactNode with Symbol $$typeof) so
      // it survives JSON round-trip. This isolates the post-hydration skip
      // behaviour from React's own serialization concerns.
      const serverPayload = { kind: "ServerProfile", id: "42" };

      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => loader,
        } as unknown as RscLoaderFactoryMap),
      );

      const stateInput = buildServerState({
        context: { rsc: serverPayload as unknown as ReactNode },
      });
      const state = await hydrateRouter(
        router,
        serializeRouterState(stateInput),
      );

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toStrictEqual(serverPayload);
    });

    it("runs loader when hydrated context excludes rsc (typical SSR config)", async () => {
      const loader = vi.fn().mockResolvedValue(node("ClientProfile"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      // Server uses excludeContext: ["rsc"] to strip the ReactNode payload —
      // the rsc namespace is absent from hydrationState.context, so the client
      // runs its loader as today.
      const fullState = buildServerState({
        context: { rsc: node("WontTravel"), data: { other: "stuff" } },
      });
      const json = serializeRouterState(fullState, {
        excludeContext: ["rsc"],
      });

      const state = await hydrateRouter(router, json);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.rsc).toStrictEqual(node("ClientProfile"));
    });

    it("runs loader for a different route on subsequent start()", async () => {
      const loader = vi.fn().mockResolvedValue(node("Loaded"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      const json = serializeRouterState(
        buildServerState({ context: { rsc: node("ServerProfile") } }),
      );

      await hydrateRouter(router, json);

      expect(loader).not.toHaveBeenCalled();

      router.stop();
      const next = await router.start("/users/99");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(loader).toHaveBeenCalledWith({ id: "99" });
      expect(next.context.rsc).toStrictEqual(node("Loaded"));
    });
  });

  describe("Stress", () => {
    it("handles concurrent clone+start+dispose cycles with per-request isolation", async () => {
      const N = 500;
      const base = createRouter(routes, { defaultRoute: "home" });
      const loaders: RscLoaderFactoryMap = {
        "users.profile": () => (params) =>
          Promise.resolve(node("Profile", { id: params.id })),
      };

      const results = await Promise.all(
        Array.from({ length: N }, async (_, i) => {
          const clone = cloneRouter(base);

          clone.usePlugin(rscServerPluginFactory(loaders));
          const state = await clone.start(`/users/${i}`);
          const rsc = state.context.rsc;

          clone.dispose();

          return rsc;
        }),
      );

      for (let i = 0; i < N; i++) {
        expect(results[i]).toStrictEqual(node("Profile", { id: String(i) }));
      }
    });
  });

  describe("Per-route SSR mode", () => {
    it("object form ssr: 'full' runs loader and writes mode='full'", async () => {
      const homeNode = node("HomePage");
      const loader = vi.fn().mockResolvedValue(homeNode);

      router.usePlugin(
        rscServerPluginFactory({
          home: { ssr: "full", loader: () => loader },
        }),
      );

      const state = await router.start("/");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.rsc).toBe(homeNode);
      expect(getSsrRscMode(state)).toBe("full");
    });

    it("object form ssr: 'client-only' skips loader and writes mode='client-only'", async () => {
      const loader = vi.fn().mockResolvedValue(node("Skipped"));

      router.usePlugin(
        rscServerPluginFactory({
          home: { ssr: "client-only", loader: () => loader },
        }),
      );

      const state = await router.start("/");

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.rsc).toBeUndefined();
      expect(getSsrRscMode(state)).toBe("client-only");
    });

    it("ssr: true → 'full'; ssr: false → 'client-only'", async () => {
      const loaderTrue = vi.fn().mockResolvedValue(node("True"));
      const loaderFalse = vi.fn().mockResolvedValue(node("False"));

      router.usePlugin(
        rscServerPluginFactory({
          home: { ssr: true, loader: () => loaderTrue },
          "users.profile": { ssr: false, loader: () => loaderFalse },
        }),
      );

      const home = await router.start("/");

      expect(loaderTrue).toHaveBeenCalledTimes(1);
      expect(getSsrRscMode(home)).toBe("full");

      router.stop();
      const profile = await router.start("/users/1");

      expect(loaderFalse).not.toHaveBeenCalled();
      expect(profile.context.rsc).toBeUndefined();
      expect(getSsrRscMode(profile)).toBe("client-only");
    });

    it("function-form resolver runs once with the resolved state", async () => {
      const resolver = vi.fn<(state: State) => RscSsrMode>(() => "full");
      const loader = vi.fn().mockResolvedValue(node("Profile"));

      router.usePlugin(
        rscServerPluginFactory({
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
      expect(state.context.rsc).toStrictEqual(node("Profile"));
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("rejects 'data-only' string at factory time", () => {
      expect(() =>
        rscServerPluginFactory({
          home: {
            ssr: "data-only",
            loader: () => () => Promise.resolve(node("X")),
          } as unknown as RscLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] mode "data-only" is not allowed for route "home". Allowed: full, client-only',
      );
    });

    it("function-form resolver returning 'data-only' rejects start()", async () => {
      const loader = vi.fn();

      router.usePlugin(
        rscServerPluginFactory({
          home: {
            ssr: () => "data-only" as unknown as RscSsrMode,
            loader: () => loader,
          },
        }),
      );

      await expect(router.start("/")).rejects.toThrow(
        '[@real-router/rsc-server-plugin] mode "data-only" is not allowed for route "home". Allowed: full, client-only',
      );

      expect(loader).not.toHaveBeenCalled();
      expect(router.getState()?.context.rsc).toBeUndefined();
      expect(router.getState()?.context.ssrRscMode).toBeUndefined();
    });

    it("function-form resolver throws → start() rejects, no mode/rsc written", async () => {
      const loader = vi.fn();

      router.usePlugin(
        rscServerPluginFactory({
          home: {
            ssr: () => {
              throw new Error("rsc-resolver-boom");
            },
            loader: () => loader,
          },
        }),
      );

      await expect(router.start("/")).rejects.toThrow("rsc-resolver-boom");

      expect(loader).not.toHaveBeenCalled();
      expect(router.getState()?.context.rsc).toBeUndefined();
      expect(router.getState()?.context.ssrRscMode).toBeUndefined();
    });

    it("validation rejects unknown keys", () => {
      expect(() =>
        rscServerPluginFactory({
          home: {
            ssr: "full",
            garbage: 1,
          } as unknown as RscLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] unexpected key "garbage" in route "home" config',
      );
    });

    it("validation rejects null entry", () => {
      expect(() =>
        rscServerPluginFactory({
          home: null as unknown as RscLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("validation rejects array entry", () => {
      expect(() =>
        rscServerPluginFactory({
          home: [] as unknown as RscLoaderFactoryMap[string],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] entry for route "home" must be a function or { ssr?, loader? } object',
      );
    });

    it("getSsrRscMode falls back to 'full' for routes without entry", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": () => () => Promise.resolve(node("Profile")),
        }),
      );

      const state = await router.start("/");

      expect(state.context.ssrRscMode).toBeUndefined();
      expect(getSsrRscMode(state)).toBe("full");
    });

    it("teardown releases both 'rsc' and 'ssrRscMode' namespace claims", async () => {
      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({
          home: { ssr: "full", loader: () => () => node("Home") },
        }),
      );

      await router.start("/");
      unsubscribe();

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();
      expect(() =>
        getPluginApi(router).claimContextNamespace("ssrRscMode"),
      ).not.toThrow();
    });

    it("releases 'rsc' namespace when 'ssrRscMode' is already claimed", () => {
      const blockingClaim =
        getPluginApi(router).claimContextNamespace("ssrRscMode");

      expect(() =>
        router.usePlugin(
          rscServerPluginFactory({
            home: () => () => Promise.resolve(node("Home")),
          }),
        ),
      ).toThrow(/already claimed/);

      expect(() =>
        getPluginApi(router).claimContextNamespace("rsc"),
      ).not.toThrow();

      blockingClaim.release();
    });
  });

  describe("Module augmentation visibility (type-level)", () => {
    it("state.context.ssrRscMode is typed as RscSsrMode | undefined", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          home: { ssr: "client-only" },
        }),
      );

      const state = await router.start("/");
      const mode: RscSsrMode | undefined = state.context.ssrRscMode;

      expect(mode).toBe("client-only");
    });
  });

  describe("getSsrRscMode runtime guard against TS-cast bypass", () => {
    const stateWith = (ssrRscMode: unknown): State => ({
      name: "users.profile",
      params: { id: "42" },
      path: "/users/42",
      transition: {
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated: [], intersection: "" },
      },
      context: { ssrRscMode } as Record<string, unknown>,
    });

    it("returns 'full' for ssrRscMode === undefined (route without entry)", () => {
      expect(getSsrRscMode(stateWith(undefined))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === null (foreign-writer garbage)", () => {
      expect(getSsrRscMode(stateWith(null))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === 0 (falsy non-nullish bypass)", () => {
      expect(getSsrRscMode(stateWith(0))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === false (boolean bypass)", () => {
      expect(getSsrRscMode(stateWith(false))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === '' (empty string bypass)", () => {
      expect(getSsrRscMode(stateWith(""))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === 'data-only' (foreign mode string)", () => {
      // RSC plugin disallows data-only at factory time, but a TS-cast bypass
      // could still write it directly into state.context. The reader must
      // treat it as garbage rather than propagating the foreign value.
      expect(getSsrRscMode(stateWith("data-only"))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === 'bogus' (arbitrary string)", () => {
      expect(getSsrRscMode(stateWith("bogus"))).toBe("full");
    });

    it("preserves the value for ssrRscMode === 'full'", () => {
      expect(getSsrRscMode(stateWith("full"))).toBe("full");
    });

    it("preserves the value for ssrRscMode === 'client-only'", () => {
      expect(getSsrRscMode(stateWith("client-only"))).toBe("client-only");
    });
  });

  describe("invalidate(router, 'rsc') — CSR revalidation", () => {
    it("re-runs RSC loader for the destination route on the next navigation after invalidate()", async () => {
      const homeNode = node("HomePage", { v: 1 });
      const listNode = node("UsersList", { v: 2 });

      const homeLoader = vi.fn().mockResolvedValue(homeNode);
      const listLoader = vi.fn().mockResolvedValue(listNode);

      router.usePlugin(
        rscServerPluginFactory({
          home: () => homeLoader,
          "users.list": () => listLoader,
        }),
      );

      await router.start("/");

      expect(homeLoader).toHaveBeenCalledTimes(1);
      expect(listLoader).not.toHaveBeenCalled();

      await router.navigate("users.list");

      expect(listLoader).not.toHaveBeenCalled();
      expect(router.getState()!.context.rsc).toBeUndefined();

      const refreshed = node("UsersList", { v: 3 });

      listLoader.mockResolvedValueOnce(refreshed);

      invalidate(router, "rsc");
      await router.navigate("users.list", {}, { reload: true });

      expect(listLoader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.rsc).toBe(refreshed);
    });

    it("re-runs loader on a same-route reload (canonical revalidation pattern)", async () => {
      let counter = 0;
      const loader = vi.fn().mockImplementation(() => {
        counter += 1;

        return Promise.resolve(node("UserProfile", { v: counter }));
      });

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      await router.start("/users/42");

      expect(
        (router.getState()!.context.rsc as { props: { v: number } }).props.v,
      ).toBe(1);

      invalidate(router, "rsc");
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(
        (router.getState()!.context.rsc as { props: { v: number } }).props.v,
      ).toBe(2);
    });

    it("is idempotent — multiple invalidate() calls collapse to a single re-run", async () => {
      const loader = vi.fn().mockResolvedValue(node("X"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");
      loader.mockClear();

      invalidate(router, "rsc");
      invalidate(router, "rsc");
      invalidate(router, "rsc");

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("preserves the flag when navigation lands on a route without an entry — next entry-route nav refreshes", async () => {
      const homeNode = node("Home");
      const loader = vi.fn().mockResolvedValue(homeNode);

      router.usePlugin(rscServerPluginFactory({ home: () => loader }));
      await router.start("/");
      loader.mockClear();

      invalidate(router, "rsc");

      const intermediate = await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
      expect(intermediate.context.rsc).toBeUndefined();

      // Flag survived the no-entry hop — reaching an entry route refreshes.
      await router.navigate("home");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.rsc).toBe(homeNode);
    });

    it("writes the mode marker but skips the loader when the destination route resolves to client-only", async () => {
      const loader = vi.fn().mockResolvedValue(node("Never"));

      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": { ssr: false, loader: () => loader },
        }),
      );
      await router.start("/");

      invalidate(router, "rsc");
      const state = await router.navigate("users.profile", { id: "42" });

      expect(loader).not.toHaveBeenCalled();
      expect(getSsrRscMode(state)).toBe("client-only");
      expect(state.context.rsc).toBeUndefined();
    });

    it("writes the mode marker even when the entry has no loader", async () => {
      router.usePlugin(
        rscServerPluginFactory({
          "users.profile": { ssr: "full" },
        }),
      );
      await router.start("/");

      invalidate(router, "rsc");
      const state = await router.navigate("users.profile", { id: "42" });

      expect(getSsrRscMode(state)).toBe("full");
      expect(state.context.rsc).toBeUndefined();
    });

    it("propagates loader rejection through the navigation that consumes the flag", async () => {
      const loader = vi
        .fn()
        .mockResolvedValueOnce(node("Profile"))
        .mockRejectedValueOnce(new Error("boom"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");

      invalidate(router, "rsc");

      await expect(
        router.navigate("users.profile", { id: "42" }, { reload: true }),
      ).rejects.toThrow("boom");
    });

    it("flag is consumed after one navigation — the navigation after that does not re-run the loader", async () => {
      const loader = vi.fn().mockResolvedValue(node("X"));

      router.usePlugin(
        rscServerPluginFactory({
          home: () => loader,
          "users.list": () => loader,
        }),
      );
      await router.start("/");
      loader.mockClear();

      invalidate(router, "rsc");
      await router.navigate("users.list");

      expect(loader).toHaveBeenCalledTimes(1);

      await router.navigate("home");

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("teardown removes the leave listener — invalidate() after unsubscribe is a no-op", async () => {
      const loader = vi.fn().mockResolvedValue(node("X"));
      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({
          home: () => loader,
          "users.list": () => loader,
        }),
      );

      await router.start("/");
      loader.mockClear();
      unsubscribe();

      invalidate(router, "rsc");
      await router.navigate("users.list");

      expect(loader).not.toHaveBeenCalled();
    });

    it("preserves the flag when navigation is cancelled mid-loader — next nav refreshes", async () => {
      const slowNode = node("Slow");
      const freshNode = node("Fresh");

      let releaseSlowLoader: () => void = () => {};
      const slowPromise = new Promise<ReactNode>((resolve) => {
        releaseSlowLoader = () => {
          resolve(slowNode);
        };
      });

      const loader = vi
        .fn()
        .mockImplementationOnce(() => slowPromise)
        .mockResolvedValueOnce(freshNode);

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/"); // home — no entry, loader untouched

      invalidate(router, "rsc");

      const ac = new AbortController();
      const navA = router.navigate(
        "users.profile",
        { id: "42" },
        { signal: ac.signal },
      );

      // Let the leave handler reach `await loader(…)`.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      ac.abort();
      releaseSlowLoader();

      await expect(navA).rejects.toThrow();

      expect(loader).toHaveBeenCalledTimes(1);

      // Flag preserved — next navigation refreshes.
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(freshNode);
    });

    it("does not leak across namespaces — markStale on a foreign namespace is ignored by this plugin", async () => {
      const loader = vi.fn().mockResolvedValue(node("X"));

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");
      loader.mockClear();

      // What ssr-data-plugin's invalidate would do:
      markStale(router, "data");

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).not.toHaveBeenCalled();

      // Own namespace still works.
      invalidate(router, "rsc");
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("preserves the flag when destination is client-only — next entry-with-loader nav refreshes", async () => {
      const homeNode = node("Home", { v: 1 });
      const refreshedNode = node("Home", { v: 2 });
      const homeLoader = vi
        .fn()
        .mockResolvedValueOnce(homeNode)
        .mockResolvedValueOnce(refreshedNode);
      const profileLoader = vi.fn().mockResolvedValue(node("Never"));

      router.usePlugin(
        rscServerPluginFactory({
          home: () => homeLoader,
          "users.profile": { ssr: false, loader: () => profileLoader },
        }),
      );
      await router.start("/");

      expect(homeLoader).toHaveBeenCalledTimes(1);

      invalidate(router, "rsc");
      await router.navigate("users.profile", { id: "42" });

      expect(profileLoader).not.toHaveBeenCalled();
      expect(homeLoader).toHaveBeenCalledTimes(1);

      await router.navigate("home");

      expect(homeLoader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(refreshedNode);
    });

    it("preserves the flag when destination is a mode-only entry (no loader)", async () => {
      const homeNode = node("Home", { v: 1 });
      const refreshedNode = node("Home", { v: 2 });
      const homeLoader = vi
        .fn()
        .mockResolvedValueOnce(homeNode)
        .mockResolvedValueOnce(refreshedNode);

      router.usePlugin(
        rscServerPluginFactory({
          home: () => homeLoader,
          "users.profile": { ssr: "full" },
        }),
      );
      await router.start("/");

      invalidate(router, "rsc");
      const profileState = await router.navigate("users.profile", {
        id: "42",
      });

      expect(homeLoader).toHaveBeenCalledTimes(1);
      expect(getSsrRscMode(profileState)).toBe("full");
      expect(profileState.context.rsc).toBeUndefined();

      await router.navigate("home");

      expect(homeLoader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(refreshedNode);
    });

    it("preserves the flag when loader rejects — retry with succeeding loader refreshes", async () => {
      const initialNode = node("Profile", { v: 1 });
      const recoveredNode = node("Profile", { v: 2 });
      const loader = vi
        .fn()
        .mockResolvedValueOnce(initialNode)
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce(recoveredNode);

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");

      expect(loader).toHaveBeenCalledTimes(1);

      invalidate(router, "rsc");

      await expect(
        router.navigate("users.profile", { id: "42" }, { reload: true }),
      ).rejects.toThrow("transient");

      expect(loader).toHaveBeenCalledTimes(2);

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(3);
      expect(router.getState()!.context.rsc).toBe(recoveredNode);
    });

    it("passes navigation signal as the second loader argument", async () => {
      const initialNode = node("Initial");
      const refreshedNode = node("Refreshed");

      let observedSignal: AbortSignal | undefined;
      let observedAbortedAtCall: boolean | undefined;

      const loader = vi
        .fn()
        .mockResolvedValueOnce(initialNode)
        .mockImplementationOnce(
          async (
            _params: unknown,
            ctx: { signal: AbortSignal } | undefined,
          ) => {
            observedSignal = ctx?.signal;
            observedAbortedAtCall = ctx?.signal.aborted;

            return refreshedNode;
          },
        );

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");

      // Start interceptor calls loader without context (SSR boot path).
      const startCallArgs = loader.mock.calls[0];

      expect(startCallArgs[1]).toBeUndefined();

      invalidate(router, "rsc");
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      // Leave handler passes { signal } from the navigation's controller.
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedAbortedAtCall).toBe(false);
    });

    it("loader's signal aborts when navigation is cancelled mid-flight", async () => {
      let capturedSignal: AbortSignal | undefined;
      let releaseSlowLoader: () => void = () => {};
      const slowPromise = new Promise<ReactNode>((resolve) => {
        releaseSlowLoader = () => {
          resolve(node("Late"));
        };
      });
      const freshNode = node("Fresh");

      const loader = vi
        .fn()
        .mockImplementationOnce(
          (_params: unknown, ctx: { signal: AbortSignal } | undefined) => {
            capturedSignal = ctx?.signal;

            return slowPromise;
          },
        )
        .mockResolvedValueOnce(freshNode);

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/");

      invalidate(router, "rsc");

      const ac = new AbortController();
      const navA = router.navigate(
        "users.profile",
        { id: "42" },
        { signal: ac.signal },
      );

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal?.aborted).toBe(false);

      ac.abort();

      expect(capturedSignal?.aborted).toBe(true);

      releaseSlowLoader();

      await expect(navA).rejects.toThrow();

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(router.getState()!.context.rsc).toBe(freshNode);
    });

    it("supports cancellation-aware loaders that abort early on signal", async () => {
      const initialNode = node("Initial");
      const recoveredNode = node("Recovered");

      const loader = vi
        .fn()
        .mockResolvedValueOnce(initialNode)
        .mockImplementationOnce(
          async (
            _params: unknown,
            ctx: { signal: AbortSignal } | undefined,
          ) => {
            return new Promise<ReactNode>((resolve, reject) => {
              const t = setTimeout(() => {
                resolve(node("Late"));
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
        .mockResolvedValueOnce(recoveredNode);

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );
      await router.start("/users/42");

      invalidate(router, "rsc");

      const ac = new AbortController();
      const navA = router.navigate(
        "users.profile",
        { id: "42" },
        { reload: true, signal: ac.signal },
      );

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      ac.abort();

      await expect(navA).rejects.toThrow();

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(router.getState()!.context.rsc).toBe(recoveredNode);
    });
  });
});
