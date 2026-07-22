import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { renderHook, render } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

// Probe component for source-caching tests (gotcha #22). Drives a single
// useRouteNode(name) call so we can mount N copies and watch how many
// underlying router.subscribe registrations they produce.
function RouteNodeProbe(props: Readonly<{ name: string }>): JSX.Element {
  const node = useRouteNode(props.name);

  return <span data-name={props.name}>{node().route?.name ?? "—"}</span>;
}

describe("useRouteNode", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return initial state", () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: wrapper(router),
    });

    expect(result().route).toBeUndefined();
    expect(result().previousRoute).toBeUndefined();
  });

  it("should not return a null route with a default route and the router started", async () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: wrapper(router),
    });

    await router.start();

    expect(result().route?.name).toStrictEqual("test");
  });

  it("should change route if hook was subscribed to root node", async () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: wrapper(router),
    });

    await router.start();

    expect(result().route?.name).toStrictEqual("test");

    await router.navigate("one-more-test");

    expect(result().route?.name).toStrictEqual("one-more-test");
  });

  it("should change route if hook was subscribed to changed node", async () => {
    const { result } = renderHook(() => useRouteNode("items"), {
      wrapper: wrapper(router),
    });

    await router.start();

    expect(result().route?.name).toBeUndefined();

    await router.navigate("items");

    expect(result().route?.name).toStrictEqual("items");

    await router.navigate("items.item", { id: 6 });

    expect(result().route?.name).toStrictEqual("items.item");
    expect(result().route?.params).toStrictEqual({ id: 6 });

    await router.navigate("items");

    expect(result().route?.name).toStrictEqual("items");
    expect(result().route?.params).toStrictEqual({});
  });

  it("should update only when node is affected", async () => {
    const { result } = renderHook(() => useRouteNode("users"), {
      wrapper: wrapper(router),
    });

    await router.start();

    expect(result().route).toBeUndefined();

    await router.navigate("home");

    expect(result().route).toBeUndefined();

    await router.navigate("users.list");

    expect(result().route?.name).toBe("users.list");

    await router.navigate("users.view", { id: "123" });

    expect(result().route?.name).toBe("users.view");

    await router.navigate("home");

    expect(result().route).toBeUndefined();
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouteNode(""))).toThrow(
      "useRouter must be used within a RouterProvider",
    );
  });

  describe("shouldUpdateNode behavior", () => {
    it("should handle navigation between unrelated nodes", async () => {
      const { result } = renderHook(() => useRouteNode("items"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("items.item", { id: "1" });

      expect(result().route?.name).toBe("items.item");

      await router.navigate("users.list");

      expect(result().route).toBeUndefined();

      await router.navigate("items.item", { id: "2" });

      expect(result().route?.name).toBe("items.item");
      expect(result().route?.params).toStrictEqual({ id: "2" });
    });

    it("should update node when parameters change", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("users.view", { id: "1" });

      expect(result().route?.name).toBe("users.view");
      expect(result().route?.params).toStrictEqual({ id: "1" });

      await router.navigate("users.view", { id: "2" });

      expect(result().route?.name).toBe("users.view");
      expect(result().route?.params).toStrictEqual({ id: "2" });
      expect(result().previousRoute?.name).toBe("users.view");
      expect(result().previousRoute?.params).toStrictEqual({ id: "1" });
    });

    it("should fire a fresh snapshot on reload (#605, transition.reload bypasses dedupe)", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("users.list");

      const initialRoute = result().route;

      await router.navigate("users.list", {}, undefined, { reload: true });

      // Reload is the user's explicit non-idempotent signal — observers
      // see fresh refs so they react to context changes (e.g. data
      // refreshed by `invalidate(router, "data")` + reload).
      expect(result().route?.name).toBe("users.list");
      expect(result().route).not.toBe(initialRoute);
      expect(result().route?.path).toBe(initialRoute?.path);
    });
  });

  describe("Node activity and state", () => {
    it("should handle node becoming inactive and active again", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("users.view", { id: "123" });

      expect(result().route?.name).toBe("users.view");

      await router.navigate("home");

      expect(result().route).toBeUndefined();
      expect(result().previousRoute?.name).toBe("users.view");

      await router.navigate("users.list");

      expect(result().route?.name).toBe("users.list");
      expect(result().previousRoute?.name).toBe("home");
    });

    it("should handle parallel nodes independently", async () => {
      const { result: usersResult } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });
      const { result: itemsResult } = renderHook(() => useRouteNode("items"), {
        wrapper: wrapper(router),
      });

      // Explicit path prevents JSDOM from carrying URL state from prior tests.
      await router.start("/");
      await router.navigate("users.list");

      expect(usersResult().route?.name).toBe("users.list");
      expect(itemsResult().route).toBeUndefined();

      await router.navigate("items.item", { id: "1" });

      expect(usersResult().route).toBeUndefined();
      expect(itemsResult().route?.name).toBe("items.item");

      await router.navigate("users.view", { id: "456" });

      expect(usersResult().route?.name).toBe("users.view");
      expect(itemsResult().route).toBeUndefined();
    });

    it("should handle deeply nested node correctly", async () => {
      getRoutesApi(router).add([
        {
          name: "admin",
          path: "/admin",
          children: [
            {
              name: "settings",
              path: "/settings",
              children: [{ name: "security", path: "/security" }],
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useRouteNode("admin.settings"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("admin");

      expect(result().route).toBeUndefined();

      await router.navigate("admin.settings");

      expect(result().route?.name).toBe("admin.settings");

      await router.navigate("admin.settings.security");

      expect(result().route?.name).toBe("admin.settings.security");
    });
  });

  describe("previousRoute edge cases", () => {
    it("should have correct previousRoute on first navigation", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();

      expect(result().previousRoute).toBeUndefined();

      await router.navigate("users.list");

      expect(result().route?.name).toBe("users.list");
    });

    it("should preserve previousRoute when leaving node", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("users.view", { id: "123" });

      const routeWhenActive = result().route;

      await router.navigate("home");

      expect(result().route).toBeUndefined();
      expect(result().previousRoute?.name).toBe("users.view");
      expect(result().previousRoute).toStrictEqual(routeWhenActive);
    });

    it("should track previousRoute through navigation chain", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();

      const chain: {
        route: string | undefined;
        previousRoute: string | undefined;
      }[] = [];

      await router.navigate("users.list");
      chain.push({
        route: result().route?.name,
        previousRoute: result().previousRoute?.name,
      });

      await router.navigate("users.view", { id: "1" });
      chain.push({
        route: result().route?.name,
        previousRoute: result().previousRoute?.name,
      });

      await router.navigate("users.edit", { id: "1" });
      chain.push({
        route: result().route?.name,
        previousRoute: result().previousRoute?.name,
      });

      await router.navigate("home");
      chain.push({
        route: result().route?.name,
        previousRoute: result().previousRoute?.name,
      });

      expect(chain[0]?.route).toBe("users.list");
      expect(chain[1]).toStrictEqual({
        route: "users.view",
        previousRoute: "users.list",
      });
      expect(chain[2]).toStrictEqual({
        route: "users.edit",
        previousRoute: "users.view",
      });
      expect(chain[3]).toStrictEqual({
        route: undefined,
        previousRoute: "users.edit",
      });
    });

    // Documents gotcha #5 "previousRoute is Global" from packages/solid/CLAUDE.md:
    //   Navigation: users.list → items → users.view
    //   useRouteNode("users")().previousRoute === items  (NOT users.list!)
    // previousRoute tracks the last visited route globally, not the last
    // route within the subscribed node's subtree.
    it("previousRoute is global — reflects last visited route even across nodes", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();

      await router.navigate("users.list");

      expect(result().route?.name).toBe("users.list");

      await router.navigate("items");

      expect(result().route).toBeUndefined();
      expect(result().previousRoute?.name).toBe("users.list");

      await router.navigate("users.view", { id: "42" });

      expect(result().route?.name).toBe("users.view");
      expect(result().previousRoute?.name).toBe("items");
    });
  });

  // Gotcha #22 from CLAUDE.md "Hook Caching via @real-router/sources":
  // N components calling useRouteNode("users") against the same router share
  // ONE source — one router.subscribe, one shouldUpdate per navigation.
  // Without this caching, 50 sidebar links would each add a subscriber and
  // the per-nav callback fanout would be N × work. This test pins the
  // contract by spying on router.subscribe and asserting it's invoked at
  // most once for repeat useRouteNode(name) calls on the same name.
  describe("Source caching (gotcha #22 — N consumers → ONE router subscription)", () => {
    it("multiple components reading the same node share one router subscription", async () => {
      const subscribeSpy = vi.spyOn(router, "subscribe");

      // Mount 5 separate hook consumers of useRouteNode("users") inside the
      // SAME RouterProvider. The cached createRouteNodeSource(router, "users")
      // must yield 5 listeners on its shared internal Set, not 5 separate
      // router.subscribe registrations.
      render(() => (
        <RouterProvider router={router}>
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="users" />
        </RouterProvider>
      ));

      // RouterProvider itself calls router.subscribe ONCE (via createRouteSource).
      // The 5 useRouteNode("users") consumers must NOT add 5 more — they all
      // multiplex through the cached createRouteNodeSource. Strict equality:
      // 1 (provider) + 1 (cached node source) = 2 total. A loose `≤ 2` would
      // pass on the regression "cache silently broke" up to 5 calls; the
      // strict check fails on the first extra subscription (#P0.4 audit).
      expect(subscribeSpy).toHaveBeenCalledTimes(2);
    });

    it("different node names produce separate cache entries but share router subscription", async () => {
      const subscribeSpy = vi.spyOn(router, "subscribe");

      // 3 distinct nodes × 2 consumers each → cache produces 3 sources,
      // each backed by a router subscription. Strict equality: 1 (provider)
      // + 3 (one cached source per distinct node name) = 4 total. The
      // previous `≤ 4` would silently absorb a regression up to 6
      // (one subscribe per useRouteNode call) (#P0.4 audit).
      render(() => (
        <RouterProvider router={router}>
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="users" />
          <RouteNodeProbe name="items" />
          <RouteNodeProbe name="items" />
          <RouteNodeProbe name="" />
          <RouteNodeProbe name="" />
        </RouterProvider>
      ));

      expect(subscribeSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe("Empty route tree (#3.4 defensive)", () => {
    it("does not throw when subscribing to root node on a router with no routes", () => {
      const emptyRouter = createRouter([]);

      const wrapEmpty = (props: { children: JSX.Element }) => (
        <RouterProvider router={emptyRouter}>{props.children}</RouterProvider>
      );

      // The hook is the public surface for createRouteNodeSource(router, "")
      // — must produce an undefined route + undefined previousRoute snapshot
      // without throwing, even when the route tree is empty (e.g. a router
      // that's been replaced via getRoutesApi().replace([])).
      expect(() => {
        const { result } = renderHook(() => useRouteNode(""), {
          wrapper: wrapEmpty,
        });

        expect(result().route).toBeUndefined();
        expect(result().previousRoute).toBeUndefined();
      }).not.toThrow();
    });
  });
});
