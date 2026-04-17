import { getRoutesApi } from "@real-router/core/api";
import { renderHook, act } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

const wrapper: FunctionComponent<{ router: Router }> = ({
  children,
  router,
}) => <RouterProvider router={router}>{children}</RouterProvider>;

describe("useRouteNode", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return initial context before router starts", () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current.navigator).toBeTypeOf("object");
    expect(result.current.navigator.navigate).toBeTypeOf("function");
    expect(result.current.route).toStrictEqual(undefined);
    expect(result.current.previousRoute).toStrictEqual(undefined);
  });

  it("should not return a null route with a default route and the router started", async () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.start();
    });

    expect(result.current.route?.name).toStrictEqual("test");
  });

  it("should change route if hook was subscribed to root node", async () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.start();
    });

    expect(result.current.route?.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("one-more-test");
    });

    expect(result.current.route?.name).toStrictEqual("one-more-test");
  });

  it("should change route if hook was subscribed to changed node", async () => {
    const { result } = renderHook(() => useRouteNode("items"), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.start();
    });

    expect(result.current.route?.name).toStrictEqual(undefined);

    await act(async () => {
      await router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");

    await act(async () => {
      await router.navigate("items.item", { id: 6 });
    });

    expect(result.current.route?.name).toStrictEqual("items.item");
    expect(result.current.route?.params).toStrictEqual({ id: 6 });

    await act(async () => {
      await router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");
    expect(result.current.route?.params).toStrictEqual({});
  });

  it("should update only when node is affected", async () => {
    const { result } = renderHook(() => useRouteNode("users"), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    await act(async () => {
      await router.start();
    });

    expect(result.current.route).toBeUndefined();

    await act(async () => {
      await router.navigate("home");
    });

    expect(result.current.route).toBeUndefined();

    await act(async () => {
      await router.navigate("users.list");
    });

    expect(result.current.route?.name).toBe("users.list");

    await act(async () => {
      await router.navigate("users.view", { id: "123" });
    });

    expect(result.current.route?.name).toBe("users.view");

    await act(async () => {
      await router.navigate("home");
    });

    expect(result.current.route).toBeUndefined();
  });

  it("should return stable reference when nothing changes", async () => {
    await act(async () => {
      await router.start();
    });

    const { result: rootResult, rerender: rerenderRoot } = renderHook(
      () => useRouteNode(""),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const firstRootResult = rootResult.current;

    rerenderRoot();

    expect(rootResult.current).toBe(firstRootResult);

    const { result: nodeResult, rerender: rerenderNode } = renderHook(
      () => useRouteNode("users"),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const firstNodeResult = nodeResult.current;

    rerenderNode();

    expect(nodeResult.current).toBe(firstNodeResult);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouteNode(""))).toThrow();
  });

  describe("shouldUpdateNode behavior", () => {
    it("should handle navigation between unrelated nodes", async () => {
      const { result } = renderHook(() => useRouteNode("items"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("items.item", { id: "1" });
      });

      expect(result.current.route?.name).toBe("items.item");

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route).toBeUndefined();

      await act(async () => {
        await router.navigate("items.item", { id: "2" });
      });

      expect(result.current.route?.name).toBe("items.item");
      expect(result.current.route?.params).toStrictEqual({ id: "2" });
    });

    it("should update node when parameters change", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "1" });

      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "2" });
      expect(result.current.previousRoute?.name).toBe("users.view");
      expect(result.current.previousRoute?.params).toStrictEqual({ id: "1" });
    });

    it("should handle reload option correctly", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list");
      });

      const initialRoute = result.current.route;

      await act(async () => {
        await router.navigate("users.list", {}, { reload: true });
      });

      expect(result.current.route?.name).toBe("users.list");
      expect(result.current.route).toBe(initialRoute);
    });
  });

  describe("Root node edge cases", () => {
    it("should handle root node with undefined state", () => {
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute).toBeUndefined();
      expect(result.current.navigator).toBeDefined();
    });

    it("should handle root node when navigating to non-existent route", async () => {
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      const initialRoute = result.current.route;

      await act(async () => {
        try {
          await router.navigate("non-existent-route");
        } catch {
          /* Expected */
        }
      });

      expect(result.current.route).toBe(initialRoute);
    });

    it("should handle dynamic nodeName switching", async () => {
      let nodeName = "";

      const { result, rerender } = renderHook(
        ({ name }: { name: string }) => useRouteNode(name),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { name: nodeName },
        },
      );

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list").catch(() => {});
      });

      expect(result.current.route?.name).toBe("users.list");

      nodeName = "users";
      rerender({ name: nodeName });

      expect(result.current.route?.name).toBe("users.list");

      nodeName = "";
      rerender({ name: nodeName });

      expect(result.current.route?.name).toBe("users.list");
    });
  });

  describe("Node activity and state", () => {
    it("should handle node becoming inactive and active again", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current.route?.name).toBe("users.view");

      await act(async () => {
        await router.navigate("home");
      });

      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute?.name).toBe("users.view");

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");
      expect(result.current.previousRoute?.name).toBe("home");
    });

    it("should handle parallel nodes independently", async () => {
      const { result: usersResult } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });
      const { result: itemsResult } = renderHook(() => useRouteNode("items"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list").catch(() => {});
      });

      expect(usersResult.current.route?.name).toBe("users.list");
      expect(itemsResult.current.route).toBeUndefined();

      await act(async () => {
        await router.navigate("items.item", { id: "1" });
      });

      expect(usersResult.current.route).toBeUndefined();
      expect(itemsResult.current.route?.name).toBe("items.item");

      await act(async () => {
        await router.navigate("users.view", { id: "456" });
      });

      expect(usersResult.current.route?.name).toBe("users.view");
      expect(itemsResult.current.route).toBeUndefined();
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
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("admin");
      });

      expect(result.current.route).toBeUndefined();

      await act(async () => {
        await router.navigate("admin.settings");
      });

      expect(result.current.route?.name).toBe("admin.settings");

      await act(async () => {
        await router.navigate("admin.settings.security");
      });

      expect(result.current.route?.name).toBe("admin.settings.security");
    });
  });

  describe("Race conditions and synchronization", () => {
    it("should handle rapid nodeName switching", async () => {
      const { result, rerender } = renderHook(
        ({ name }: { name: string }) => useRouteNode(name),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { name: "users" },
        },
      );

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");

      rerender({ name: "items" });
      await act(async () => {
        await router.navigate("items.item", { id: "1" });
      });

      expect(result.current.route?.name).toBe("items.item");

      rerender({ name: "users" });
      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(result.current.route?.name).toBe("users.view");

      rerender({ name: "" });

      expect(result.current.route?.name).toBe("users.view");
    });

    it("should handle multiple hooks for same node", async () => {
      const { result: result1 } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });
      const { result: result2 } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });
      const { result: result3 } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result1.current.route?.name).toBe("users.list");
      expect(result2.current.route?.name).toBe("users.list");
      expect(result3.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result1.current.route?.name).toBe("users.view");
      expect(result2.current.route?.name).toBe("users.view");
      expect(result3.current.route?.name).toBe("users.view");
      expect(result1.current.route?.params).toStrictEqual({ id: "123" });
      expect(result2.current.route?.params).toStrictEqual({ id: "123" });
      expect(result3.current.route?.params).toStrictEqual({ id: "123" });
    });

    it("should handle nodeName change after navigation completes", async () => {
      const { result, rerender } = renderHook(
        ({ name }: { name: string }) => useRouteNode(name),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { name: "users" },
        },
      );

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");

      rerender({ name: "items" });
      await act(async () => {
        await router.navigate("items.item", { id: "1" });
      });

      expect(result.current.route?.name).toBe("items.item");

      rerender({ name: "users" });
      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(result.current.route?.name).toBe("users.view");
    });
  });

  describe("previousRoute edge cases", () => {
    it("should return global previousRoute, not node-scoped (gotcha)", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("items");
      });

      expect(result.current.route).toBeUndefined();

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.previousRoute?.name).toBe("items");
    });

    it("should have correct previousRoute on first navigation", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      expect(result.current.previousRoute).toBeUndefined();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");
    });

    it("should preserve previousRoute when leaving node", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      const routeWhenActive = result.current.route;

      await act(async () => {
        await router.navigate("home");
      });

      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute?.name).toBe("users.view");
      expect(result.current.previousRoute).toStrictEqual(routeWhenActive);
    });

    it("should track previousRoute through navigation chain", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      await act(async () => {
        await router.start();
      });

      const chain: {
        route: string | undefined;
        previousRoute: string | undefined;
      }[] = [];

      await act(async () => {
        await router.navigate("users.list");
      });
      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });
      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });
      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(async () => {
        await router.navigate("home");
      });
      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
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
  });
});
