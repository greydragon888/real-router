import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { rscServerPluginFactory } from "../../src";

import type { RscLoaderFactoryMap } from "../../src";
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

    it("should reject non-function loader values", () => {
      expect(() =>
        rscServerPluginFactory({
          home: "not-a-function" as unknown as RscLoaderFactoryMap["string"],
        }),
      ).toThrow(
        '[@real-router/rsc-server-plugin] loader for route "home" must be a function',
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
});
