import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { computeSnapshot } from "../../src/computeSnapshot.js";
import { stabilizeState } from "../../src/stabilizeState.js";

import type { Router, State } from "@real-router/core";

describe("stabilizeState", () => {
  const routes = [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/" },
        { name: "view", path: "/:id" },
        { name: "edit", path: "/:id/edit" },
      ],
    },
    {
      name: "admin",
      path: "/admin",
      children: [
        { name: "dashboard", path: "/" },
        { name: "settings", path: "/settings" },
      ],
    },
  ];

  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  // ===
  // Basic scenarios
  // ===

  describe("basic scenarios", () => {
    it("same reference (prev === next) → returns prev", () => {
      const api = getPluginApi(router);
      const state = api.makeState("home", {}, undefined, "/");

      expect(stabilizeState(state, state)).toBe(state);
    });

    it("both undefined → returns prev", () => {
      const result = stabilizeState<State | undefined>(undefined, undefined);

      expect(result).toBeUndefined();
    });

    it("prev = undefined, next = State → returns next", () => {
      const api = getPluginApi(router);
      const next = api.makeState("home", {}, undefined, "/");

      const result = stabilizeState(undefined, next);

      expect(result).toBe(next);
    });

    it("prev = State, next = undefined → returns next (undefined)", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, undefined, "/");

      const result = stabilizeState(prev, undefined);

      expect(result).toBeUndefined();
    });
  });

  // ===
  // Path-based stabilization
  // ===

  describe("path-based stabilization", () => {
    it("same path, different meta.id → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {});
      const next = api.makeState("home", {});

      expect(prev).not.toBe(next);
      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, different transition → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, undefined, "/");
      const next = api.makeState("home", {}, undefined, "/");

      expect(prev).not.toBe(next);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, different meta + transition → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState(
        "users.view",
        { id: "1" },
        undefined,
        "/users/1",
      );
      const next = api.makeState(
        "users.view",
        { id: "1" },
        undefined,
        "/users/1",
      );

      expect(prev).not.toBe(next);
      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, without meta vs with meta → result === prev", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, undefined, "/");
      const next = api.makeState("home", {});

      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("different paths → result === next", () => {
      const api = getPluginApi(router);
      const prev = api.makeState("home", {}, undefined, "/");
      const next = api.makeState(
        "users.view",
        { id: "1" },
        undefined,
        "/users/1",
      );

      expect(stabilizeState(prev, next)).toBe(next);
    });

    it("different paths, same name → result === next", () => {
      const api = getPluginApi(router);
      const prev = api.makeState(
        "users.view",
        { id: "1" },
        undefined,
        "/users/1",
      );
      const next = api.makeState(
        "users.view",
        { id: "2" },
        undefined,
        "/users/2",
      );

      expect(stabilizeState(prev, next)).toBe(next);
    });
  });

  // ===
  // Integration with real router
  // ===

  describe("integration with real router", () => {
    it("inactive node: snapshot ref stable when route = undefined for both", async () => {
      const initialSnapshot = computeSnapshot(
        { route: undefined, previousRoute: undefined },
        router,
        "admin.settings",
      );

      expect(initialSnapshot.route).toBeUndefined();

      await router.navigate("users.view", { id: "1" });

      const afterNav = computeSnapshot(
        initialSnapshot,
        router,
        "admin.settings",
      );

      expect(afterNav).toBe(initialSnapshot);
    });

    it("reload to same route: stabilizeState returns next (transition.reload === true bypasses dedupe, #605)", async () => {
      await router.navigate("users.view", { id: "42" });

      const prevRoute = router.getState()!;

      await router.navigate("users.view", { id: "42" }, undefined, {
        reload: true,
      });

      const nextRoute = router.getState()!;

      expect(prevRoute.path).toBe(nextRoute.path);
      expect(prevRoute).not.toBe(nextRoute);
      // Reload is the user's explicit non-idempotent signal — observers
      // should see fresh context (data refreshed by `invalidate()`-driven
      // loader re-runs in SSR plugins).
      expect(nextRoute.transition.reload).toBe(true);
      expect(stabilizeState(prevRoute, nextRoute)).toBe(nextRoute);
    });

    it("navigate to different route: path changed → returns next", async () => {
      const prevRoute = router.getState()!;

      await router.navigate("users.view", { id: "1" });

      const nextRoute = router.getState()!;

      expect(prevRoute.path).not.toBe(nextRoute.path);
      expect(stabilizeState(prevRoute, nextRoute)).toBe(nextRoute);
    });
  });

  // ===
  // Hash-aware stabilization (#532)
  // ===

  describe("hash-aware stabilization (#532)", () => {
    function makeStateWithHash(base: State, hash: string | undefined): State {
      // Clone the state with a fresh context.url. Path/name/params identical
      // on purpose — emulates the same-path-different-hash scenario.
      const clone = {
        ...base,
        context: {
          ...base.context,
          url:
            hash === undefined
              ? undefined
              : Object.freeze({ hash, hashChanged: true }),
        },
      };

      return clone;
    }

    it("same path, different context.url.hash → returns next", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = makeStateWithHash(base, "profile");
      const next = makeStateWithHash(base, "billing");

      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(next);
    });

    it("same path, same context.url.hash → returns prev", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = makeStateWithHash(base, "profile");
      const next = makeStateWithHash(base, "profile");

      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, prev has hash, next has no hash → returns next", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = makeStateWithHash(base, "anchor");
      const next = makeStateWithHash(base, undefined);

      expect(stabilizeState(prev, next)).toBe(next);
    });

    it("same path, both no hash → returns prev (legacy behavior preserved)", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = makeStateWithHash(base, undefined);
      const next = makeStateWithHash(base, undefined);

      expect(stabilizeState(prev, next)).toBe(prev);
    });
  });

  // ===
  // Reload-aware stabilization (#605)
  // ===

  describe("reload-aware stabilization (#605)", () => {
    function withReload(state: State, reload: boolean): State {
      return {
        ...state,
        transition: {
          phase: "activating" as const,
          reason: "success" as const,
          segments: { deactivated: [], activated: [], intersection: "" },
          ...(reload ? { reload: true } : {}),
        },
      };
    }

    it("same path, next.transition.reload === true → returns next (bypass dedupe)", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = withReload(base, false);
      const next = withReload(base, true);

      expect(prev.path).toBe(next.path);
      expect(stabilizeState(prev, next)).toBe(next);
    });

    it("same path, neither has reload → returns prev (legacy behavior)", () => {
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = withReload(base, false);
      const next = withReload(base, false);

      expect(stabilizeState(prev, next)).toBe(prev);
    });

    it("same path, prev has reload (next does not) → returns prev", () => {
      // Only `next.transition.reload` is consulted — the predecessor's
      // reload flag is irrelevant; what matters is whether the current
      // navigation was an explicit reload request.
      const api = getPluginApi(router);
      const base = api.makeState("home", {}, undefined, "/");
      const prev = withReload(base, true);
      const next = withReload(base, false);

      expect(stabilizeState(prev, next)).toBe(prev);
    });
  });

  describe("defensive reload-flag read (audit §5.G)", () => {
    it("state with missing `.transition` does not throw (dedups normally)", () => {
      // Type-erased input simulating a malformed state from a plugin or
      // future fork. The dedup path must NOT throw TypeError when
      // `state.transition` is undefined.
      const malformed = {
        name: "home",
        params: {},
        path: "/",
        context: {},
        // transition: missing
      } as unknown as State;

      // path-equal → dedup branch reads transition.reload. With the defensive
      // optional chain, the read returns false (not-a-reload) and we dedup.
      expect(() => stabilizeState(malformed, malformed)).not.toThrow();

      // Different references, same path, no transition → still dedups to prev.
      const malformed2 = {
        name: "home",
        params: {},
        path: "/",
        context: {},
      } as unknown as State;

      expect(stabilizeState(malformed, malformed2)).toBe(malformed);
    });

    it("state with missing `.transition` and different path returns next", () => {
      const malformedA = {
        name: "home",
        params: {},
        path: "/",
        context: {},
      } as unknown as State;
      const malformedB = {
        name: "users",
        params: {},
        path: "/users",
        context: {},
      } as unknown as State;

      expect(stabilizeState(malformedA, malformedB)).toBe(malformedB);
    });
  });
});
