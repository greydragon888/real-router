import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
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

    it("auto-flattens nested promises (Promise<Promise<ReactNode>>) to the inner value", async () => {
      // Edge case: a TS-cast bypass returns a doubly-wrapped promise.
      // JS Promise.resolve adopts thenable state, so `await` collapses
      // both layers — state.context.rsc lands as the inner ReactNode,
      // not a Promise. Document the auto-flattening as a contract so a
      // future refactor that introduces wait-only-once logic can't
      // silently break this case.
      const inner = node("Inner", { v: 42 });
      const nestedLoader = (): unknown =>
        Promise.resolve(Promise.resolve(inner));

      router.usePlugin(
        rscServerPluginFactory({
          home: () => nestedLoader as () => ReactNode,
        }),
      );

      const state = await router.start("/");

      // Reference identity proves the inner ReactNode survived — neither
      // wrapper Promise leaked through. `.not.toBeInstanceOf(Promise)` alone
      // would still pass for a stray thenable POJO with own `.then`, so
      // assert both the absence of `.then` AND the exact element shape.
      expect(state.context.rsc).toBe(inner);
      expect(state.context.rsc).not.toBeInstanceOf(Promise);
      expect((state.context.rsc as { then?: unknown }).then).toBeUndefined();
      expect(state.context.rsc).toStrictEqual({
        type: "Inner",
        props: { v: 42 },
        key: null,
        $$typeof: Symbol.for("react.element"),
      });
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

      // The sentinel must have been overwritten by the subscribe callback —
      // otherwise the subscription never fired and `toBeUndefined()` below
      // would pass for the wrong reason (callback unreached, not callback
      // observing undefined `rsc`).
      expect(subscribeRsc).not.toBe("sentinel");
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

  describe("Validation — edge cases (gotchas §5.2-§5.6)", () => {
    it("accepts empty-string route name '' (validator passes, plugin compiles entry)", () => {
      // §5.2: core's route-tree filters empty names so this entry is
      // unreachable at runtime — but validateLoaders treats keys as
      // opaque strings and accepts. Pin current accept-and-ignore
      // semantics so a future tightening (reject empty names at
      // validation time) is a deliberate breaking change.
      expect(() =>
        rscServerPluginFactory({
          "": () => () => node("Unreachable"),
        }),
      ).not.toThrow();
    });

    it("ignores entries inherited via prototype with __proto__ as own key would (§5.4)", () => {
      // §5.4: writing `__proto__: badEntry` in a literal sets the
      // PROTOTYPE, not an own property — validator's Object.entries
      // walks own enumerable keys only, so the prototype chain is
      // invisible. Define `__proto__` as an OWN property via
      // defineProperty to confirm it's then treated as a regular
      // string key (rejected: not function, not { ssr?, loader? }).
      const loaders: Record<string, unknown> = {};

      Object.defineProperty(loaders, "__proto__", {
        value: "not-a-function",
        enumerable: true,
        configurable: true,
        writable: true,
      });

      expect(() =>
        rscServerPluginFactory(loaders as RscLoaderFactoryMap),
      ).toThrow(
        '[@real-router/rsc-server-plugin] entry for route "__proto__" must be a function or { ssr?, loader? } object',
      );
    });

    it("ignores entry's symbolic keys (gotcha §5.5)", () => {
      // §5.5: Object.keys() and Object.entries() skip symbols, so the
      // validator's key-restriction check (allow only "ssr"/"loader")
      // never sees them. Symbols are inert at runtime — Map lookup
      // uses state.name (string), so no symbolic loader is ever called.
      const symbolKey = Symbol("hidden");
      const entry: Record<string | symbol, unknown> = {
        loader: () => () => node("Visible"),
        [symbolKey]: "ignored-by-validator",
      };

      expect(() =>
        rscServerPluginFactory({
          home: entry,
        }),
      ).not.toThrow();
    });

    it("rejects numeric ssr (NaN/0/Infinity) with the typed error (gotcha §5.6)", () => {
      // §5.6: validator branches on `typeof ssr === "function" | "boolean"
      // | "string"`. Numbers (including NaN, 0, Infinity) hit none of
      // these branches and fall through to the catch-all TypeError. The
      // existing test suite covers strings/booleans/objects but not
      // numbers — pin the explicit numeric branch.
      for (const ssrValue of [Number.NaN, 0, Number.POSITIVE_INFINITY]) {
        expect(() =>
          rscServerPluginFactory({
            home: {
              ssr: ssrValue,
              loader: () => () => node("Home"),
            } as unknown as RscLoaderFactoryMap[string],
          }),
        ).toThrow(
          '[@real-router/rsc-server-plugin] ssr for route "home" must be SsrMode string, boolean, or (state) => SsrMode',
        );
      }
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
        }),
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

  describe("Serialization: strip 'rsc' before transport (gotcha §4.2)", () => {
    // `state.context.rsc` is a ReactNode — an object tree carrying functions
    // and Symbol-keyed brands ($$typeof). JSON-serializing it via the default
    // `serializeRouterState(state)` silently drops those non-JSON values,
    // producing a payload that LOOKS valid but cannot be rehydrated as a
    // ReactNode. The contract is "strip rsc via excludeContext"; these tests
    // pin both the failure mode (lossy default) and the success mode
    // (excludeContext omits the namespace entirely).
    it("default serialization silently drops the React element's $$typeof Symbol", async () => {
      const rscNode = node("HomePage", { greeting: "hi" });

      router.usePlugin(rscServerPluginFactory({ home: () => () => rscNode }));

      const state = await router.start("/");

      const json = serializeRouterState(state);
      const parsed = JSON.parse(json) as {
        context: { rsc?: { $$typeof?: unknown; type?: string } };
      };

      // The rsc key IS present in the JSON (no exclusion), but the React
      // element's `$$typeof: Symbol.for("react.element")` is silently
      // dropped — JSON has no Symbol representation. Other own properties
      // survive, so the payload looks plausible to inattentive eyes.
      expect(parsed.context.rsc).toBeDefined();
      expect(parsed.context.rsc?.type).toBe("HomePage");
      // ← the destructive loss: the brand that React uses to validate
      // elements at render time is gone.
      expect(parsed.context.rsc?.$$typeof).toBeUndefined();
    });

    it("excludeContext: ['rsc'] omits the namespace entirely (recommended SSR config)", async () => {
      const rscNode = node("HomePage");

      router.usePlugin(rscServerPluginFactory({ home: () => () => rscNode }));

      const state = await router.start("/");

      const json = serializeRouterState(state, { excludeContext: ["rsc"] });
      const parsed = JSON.parse(json) as { context: Record<string, unknown> };

      // The key is GONE — not present, not undefined. This is what apps
      // ship over the wire; the Flight payload travels via the bundler's
      // stream renderer alongside the JSON state. `in` (own-property
      // check) distinguishes "key absent" from "key present with
      // undefined" so a regression that re-introduced the key would fail.
      expect("rsc" in parsed.context).toBe(false);
    });

    it("excludeContext only strips listed namespaces — other context survives", async () => {
      const rscNode = node("HomePage");

      router.usePlugin(rscServerPluginFactory({ home: () => () => rscNode }));

      const state = await router.start("/");
      // Inject a sibling namespace synthetically so this test stays
      // independent of ssr-data-plugin's claim mechanics.
      const augmented = {
        ...state,
        context: { ...state.context, data: { preferences: { theme: "dark" } } },
      };

      const json = serializeRouterState(augmented, {
        excludeContext: ["rsc"],
      });
      const parsed = JSON.parse(json) as {
        context: { rsc?: unknown; data?: { preferences: { theme: string } } };
      };

      expect("rsc" in parsed.context).toBe(false);
      // Surgical: the data namespace rides through untouched, proving
      // excludeContext is a narrow filter (not "strip all non-JSON").
      expect(parsed.context.data).toStrictEqual({
        preferences: { theme: "dark" },
      });
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

  describe("Single-instance enforcement (gotcha)", () => {
    it("rejects double-registration of rscServerPluginFactory on the same router", () => {
      router.usePlugin(
        rscServerPluginFactory({ home: () => () => node("First") }),
      );

      // The "rsc" namespace is exclusive — the second factory tries to
      // claim it again and core's collision detector throws.
      expect(() => {
        router.usePlugin(
          rscServerPluginFactory({ home: () => () => node("Second") }),
        );
      }).toThrow(/already claimed/i);
    });

    it("releases the rsc namespace on teardown so a fresh factory can re-register", async () => {
      const unsubscribe1 = router.usePlugin(
        rscServerPluginFactory({ home: () => () => node("First") }),
      );

      unsubscribe1();

      // Same router, fresh factory after teardown — no claim collision.
      const unsubscribe2 = router.usePlugin(
        rscServerPluginFactory({ home: () => () => node("Second") }),
      );

      const state = await router.start("/");

      expect(state.context.rsc).toStrictEqual(node("Second"));

      unsubscribe2();
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

    it("returns 'full' when ssrRscMode getter throws (gotcha §5.7)", () => {
      // Confirmed bug-risk from the audit: a foreign writer that installs
      // a throwing getter on state.context.ssrRscMode previously caused
      // getSsrRscMode to propagate the exception. The defensive read is
      // now wrapped in try/catch — any throw collapses to "full".
      const context: Record<string, unknown> = {};

      Object.defineProperty(context, "ssrRscMode", {
        get() {
          throw new Error("foreign-getter boom");
        },
        enumerable: true,
        configurable: true,
      });

      const state: State = {
        name: "users.profile",
        params: { id: "42" },
        path: "/users/42",
        transition: {
          phase: "activating",
          reason: "success",
          segments: { deactivated: [], activated: [], intersection: "" },
        },
        context,
      };

      expect(() => getSsrRscMode(state)).not.toThrow();
      expect(getSsrRscMode(state)).toBe("full");
    });

    it("returns 'full' for ssrRscMode === Symbol(...) (gotcha §5.9)", () => {
      // Symbols bypass the `typeof === "string"` guard naturally; pinning
      // explicit coverage so a refactor that switched to e.g. duck-typing
      // would surface here.
      expect(getSsrRscMode(stateWith(Symbol("foreign-mode")))).toBe("full");
    });

    it("returns 'full' for ssrRscMode === Object.create(String.prototype) (gotcha §5.10)", () => {
      // Object that looks string-shaped via inherited prototype but
      // `typeof !== "string"`. The first-condition typeof check is the
      // canonical defense; this pins the proxy-like attack surface.
      const fakeString = Object.create(String.prototype) as unknown;

      expect(getSsrRscMode(stateWith(fakeString))).toBe("full");
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

      // Flag consumed by the first nav — a second nav without a fresh
      // invalidate() MUST NOT re-trigger the loader. Catches a regression
      // where stacked invalidates would each survive one extra navigation
      // instead of collapsing into a single one.
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

    it("in-flight transition is unchanged; following navigation consumes the flag (gotcha §4.10)", async () => {
      // Documented contract (CLAUDE.md:188): "Behaviour during an in-flight
      // transition is deferred — the current transition completes unchanged;
      // the *following* navigation consumes the flag."
      //
      // Construct a slow navigation that's awaiting its loader. While that
      // navigation is mid-flight, call invalidate(). The current navigation
      // must complete with the FIRST loader's result (no extra runs), and
      // a fresh follow-up navigation must trigger a refresh.
      const firstNode = node("First");
      const secondNode = node("Second");
      const thirdNode = node("Third");

      let releaseFirst: () => void = () => {};
      const firstPromise = new Promise<ReactNode>((resolve) => {
        releaseFirst = () => {
          resolve(firstNode);
        };
      });

      const loader = vi
        .fn()
        .mockImplementationOnce(() => firstPromise) // in-flight start()
        .mockResolvedValueOnce(secondNode) // post-invalidate follow-up nav
        .mockResolvedValueOnce(thirdNode); // sanity: no further loader calls beyond two

      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      const startPromise = router.start("/users/42");

      // Yield for the start interceptor to reach `await loader(…)`. Mirrors
      // the priming cadence used in `cancelled mid-loader` test above.
      const YIELDS_TO_REACH_LOADER_AWAIT = 3;

      for (let i = 0; i < YIELDS_TO_REACH_LOADER_AWAIT; i++) {
        await Promise.resolve();
      }

      // Fire invalidate WHILE the start interceptor is awaiting its loader.
      // Contract says: this should NOT cause the in-flight start to re-run
      // the loader, AND the flag should survive until the next navigation.
      invalidate(router, "rsc");

      releaseFirst();
      const state = await startPromise;

      // Current transition: exactly one loader call, exactly the first
      // payload. The invalidate did NOT inject a duplicate run mid-flight.
      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.rsc).toBe(firstNode);

      // Following navigation: the flag is consumed in LEAVE_APPROVE phase,
      // loader runs a second time, fresh payload lands on nextRoute.
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(secondNode);

      // Sanity: the flag is single-shot — a third navigation without a
      // fresh invalidate must NOT touch the loader.
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("invalidate after unsub + re-usePlugin re-uses the pre-existing flag (gotcha §3.7)", async () => {
      // CLAUDE.md "Stale flag survives plugin teardown until router is GC'd":
      // the per-router WeakMap is NOT cleared on teardown, so a hot-swap
      // (unsub → re-usePlugin) on the SAME router instance picks up any
      // mark that was set before teardown. This test pins that intentional
      // behaviour so a future refactor that "fixes" it by clearing on
      // teardown would surface here as a deliberate breaking change.
      const firstNode = node("First");
      const secondNode = node("Second");
      const loader = vi
        .fn()
        .mockResolvedValueOnce(firstNode)
        .mockResolvedValueOnce(secondNode);

      const unsubscribe = router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      await router.start("/users/42");

      expect(loader).toHaveBeenCalledTimes(1);
      expect(router.getState()!.context.rsc).toBe(firstNode);

      // Set the flag BEFORE teardown. The WeakMap entry persists.
      invalidate(router, "rsc");

      // Teardown removes the leave listener but leaves the flag in place.
      unsubscribe();

      // Re-register a fresh plugin on the SAME router. The new
      // subscribeLeave listener observes the pre-existing flag.
      router.usePlugin(
        rscServerPluginFactory({ "users.profile": () => loader }),
      );

      await router.navigate("users.profile", { id: "42" }, { reload: true });

      // The pre-existing flag was consumed by the new listener — second
      // loader call, fresh payload.
      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(secondNode);
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

      // Yield enough microtasks for the leave handler to reach
      // `await loader(…)`. The empirically-required count is 3 yields:
      //   tick 1 — navigate() schedules LEAVE_APPROVE
      //   tick 2 — leave handler's `await router…` resolves
      //   tick 3 — handler enters `await loader(params, { signal })`
      // The number is brittle to additions of `await` upstream in
      // `createSsrLoaderPlugin.ts`; tighten the count only after
      // re-verifying empirically. Looping rather than three open-coded
      // statements makes the count self-documenting.
      const YIELDS_TO_REACH_LOADER_AWAIT = 3;

      for (let i = 0; i < YIELDS_TO_REACH_LOADER_AWAIT; i++) {
        await Promise.resolve();
      }

      ac.abort();
      releaseSlowLoader();

      await expect(navA).rejects.toThrow();

      expect(loader).toHaveBeenCalledTimes(1);

      // Flag preserved — next navigation refreshes.
      await router.navigate("users.profile", { id: "42" }, { reload: true });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(router.getState()!.context.rsc).toBe(freshNode);
    });

    it("does not leak across cloneRouter() boundaries — invalidate(parent) doesn't trigger child loader", async () => {
      // The stale registry is `WeakMap<Router, Set<string>>`, so per-router
      // isolation should come free from the WeakMap key identity. Verify
      // that `invalidate(childA)` is consumed only by childA's leave
      // handler — childB navigation stays cold.
      const base = createRouter(routes, { defaultRoute: "home" });
      const childA = cloneRouter(base);
      const childB = cloneRouter(base);

      const loaderA = vi.fn().mockResolvedValue(node("A"));
      const loaderB = vi.fn().mockResolvedValue(node("B"));

      childA.usePlugin(rscServerPluginFactory({ home: () => loaderA }));
      childB.usePlugin(rscServerPluginFactory({ home: () => loaderB }));

      await childA.start("/");
      await childB.start("/");

      loaderA.mockClear();
      loaderB.mockClear();

      // Mark only childA stale.
      invalidate(childA, "rsc");

      // childB navigation reloads — but its own stale flag is clean,
      // so the leave handler must no-op.
      await childB.navigate("home", {}, { reload: true });

      expect(loaderB).not.toHaveBeenCalled();

      // childA navigation reloads — its flag is set, leave handler runs.
      await childA.navigate("home", {}, { reload: true });

      expect(loaderA).toHaveBeenCalledTimes(1);

      childA.dispose();
      childB.dispose();
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
      // Asserting the full args tuple — `toStrictEqual([{ id: "42" }])` —
      // instead of only the second-index access pins both the params
      // payload AND the absence of a ctx argument (length === 1).
      // `toHaveBeenCalledWith(params, undefined)` would NOT work here —
      // vitest treats `f(x)` and `f(x, undefined)` as distinct call
      // shapes by arity, and the start path passes a single argument.
      // Guard the indexed access — without it, a regression that skips
      // the loader entirely would surface as `undefined.toStrictEqual(…)`
      // rather than a meaningful "expected 1 call, got 0".
      expect(loader).toHaveBeenCalledTimes(1);
      expect(loader.mock.calls[0]).toStrictEqual([{ id: "42" }]);

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
