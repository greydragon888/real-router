import { getRoutesApi } from "@real-router/core/api";
import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

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

    expect(result().route).toStrictEqual(undefined);
    expect(result().previousRoute).toStrictEqual(undefined);
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

    expect(result().route?.name).toStrictEqual(undefined);

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

    it("should handle reload option correctly", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: wrapper(router),
      });

      await router.start();
      await router.navigate("users.list");

      const initialRoute = result().route;

      await router.navigate("users.list", {}, { reload: true });

      expect(result().route?.name).toBe("users.list");
      expect(result().route).toBe(initialRoute);
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

      await router.start();
      await router.navigate("users.list").catch(() => {});

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
});
