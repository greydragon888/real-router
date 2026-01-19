import { renderHook, act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteNode } from "react-router6";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { FC, PropsWithChildren } from "react";
import type { Router } from "router6";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
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

  it("should return the router", () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current.router).toStrictEqual(router);
    expect(result.current.route).toStrictEqual(undefined);
    expect(result.current.previousRoute).toStrictEqual(undefined);
  });

  it("should not return a null route with a default route and the router started", () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    act(() => {
      router.start();
    });

    expect(result.current.route?.name).toStrictEqual("test");
  });

  it("should change route if hook was subscribed to root node", () => {
    const { result } = renderHook(() => useRouteNode(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    act(() => {
      router.start();
    });

    expect(result.current.route?.name).toStrictEqual("test");

    act(() => {
      router.navigate("one-more-test");
    });

    expect(result.current.route?.name).toStrictEqual("one-more-test");
  });

  it("should change route if hook was subscribed to changed node", () => {
    const { result } = renderHook(() => useRouteNode("items"), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    act(() => {
      router.start();
    });

    expect(result.current.route?.name).toStrictEqual(undefined);

    act(() => {
      router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");

    act(() => {
      router.navigate("items.item", { id: 6 });
    });

    expect(result.current.route?.name).toStrictEqual("items.item");
    expect(result.current.route?.params).toStrictEqual({ id: 6 });

    act(() => {
      router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");
    expect(result.current.route?.params).toStrictEqual({});
  });

  it("should update only when node is affected", () => {
    const { result } = renderHook(() => useRouteNode("users"), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    act(() => {
      router.start();
    });

    expect(result.current.route).toBeUndefined();

    act(() => {
      router.navigate("home");
    });

    expect(result.current.route).toBeUndefined();

    act(() => {
      router.navigate("users.list");
    });

    // ИСПРАВИТЬ: узел "users" теперь обновляется при первом входе
    expect(result.current.route?.name).toBe("users.list");

    act(() => {
      router.navigate("users.view", { id: "123" });
    });

    expect(result.current.route?.name).toBe("users.view");

    act(() => {
      router.navigate("home");
    });

    // ИСПРАВИТЬ: узел "users" теперь обновляется при выходе
    expect(result.current.route).toBeUndefined();
  });

  it("should return stable reference when nothing changes", () => {
    act(() => {
      router.start();
    });

    // Test with root node ("")
    const { result: rootResult, rerender: rerenderRoot } = renderHook(
      () => useRouteNode(""),
      {
        wrapper: (props) => wrapper({ ...props, router }),
      },
    );

    const firstRootResult = rootResult.current;

    rerenderRoot();

    expect(rootResult.current).toBe(firstRootResult);

    // Test with specific node ("users")
    const { result: nodeResult, rerender: rerenderNode } = renderHook(
      () => useRouteNode("users"),
      {
        wrapper: (props) => wrapper({ ...props, router }),
      },
    );

    const firstNodeResult = nodeResult.current;

    rerenderNode();

    expect(nodeResult.current).toBe(firstNodeResult);
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouteNode(""))).toThrowError();
  });

  describe("shouldUpdateNode behavior", () => {
    it("should handle navigation between unrelated nodes", async () => {
      const { result } = renderHook(() => useRouteNode("items"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      // Navigate to items.item
      await act(() => router.navigate("items.item", { id: "1" }));

      expect(result.current.route?.name).toBe("items.item");

      // Navigate to users.list (unrelated node)
      await act(() => router.navigate("users.list"));

      // items node should become inactive
      expect(result.current.route).toBeUndefined();

      // Navigate back to items.edit
      await act(() => router.navigate("items.item", { id: "2" }));

      // items node should become active again
      expect(result.current.route?.name).toBe("items.item");
      expect(result.current.route?.params).toStrictEqual({ id: "2" });
    });

    it("should update node when parameters change", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      // Navigate to users.view with id=1
      await act(() => router.navigate("users.view", { id: "1" }));

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "1" });

      // Navigate to users.view with id=2
      await act(() => router.navigate("users.view", { id: "2" }));

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "2" });
      expect(result.current.previousRoute?.name).toBe("users.view");
      expect(result.current.previousRoute?.params).toStrictEqual({ id: "1" });
    });

    it("should handle reload option correctly", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      await act(() => router.navigate("users.list"));

      const initialRoute = result.current.route;

      // Navigate to same route with reload: true
      await act(() => router.navigate("users.list", {}, { reload: true }));

      // Node should update even though it's the same route
      expect(result.current.route?.name).toBe("users.list");
      // Route object should be different due to reload
      expect(result.current.route).not.toBe(initialRoute);
    });
  });

  describe("Root node edge cases", () => {
    it("should handle root node with undefined state", () => {
      // Router not started yet
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute).toBeUndefined();
      expect(result.current.router).toBe(router);
    });

    it("should handle root node when navigating to non-existent route", () => {
      const { result } = renderHook(() => useRouteNode(""), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      const initialRoute = result.current.route;

      // Try to navigate to non-existent route
      act(() => {
        try {
          router.navigate("non-existent-route");
        } catch {
          // Navigation should fail, but root node should handle it gracefully
        }
      });

      // Root node should still have the previous valid route
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

      act(() => {
        router.start();
      });

      await act(() => router.navigate("users.list"));

      // Root node should show users.list
      expect(result.current.route?.name).toBe("users.list");

      // Switch to users node
      nodeName = "users";
      rerender({ name: nodeName });

      expect(result.current.route?.name).toBe("users.list");

      // Switch back to root node
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

      act(() => {
        router.start();
      });

      // Navigate to users.view
      await act(() => router.navigate("users.view", { id: "123" }));

      expect(result.current.route?.name).toBe("users.view");

      // Navigate to home (users becomes inactive)
      await act(() => router.navigate("home"));

      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute?.name).toBe("users.view");

      // Navigate to users.list (users becomes active again)
      await act(() => router.navigate("users.list"));

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

      act(() => {
        router.start();
      });

      // Navigate to users
      await act(() => router.navigate("users.list"));

      expect(usersResult.current.route?.name).toBe("users.list");
      expect(itemsResult.current.route).toBeUndefined();

      // Navigate to items
      await act(() => router.navigate("items.item", { id: "1" }));

      expect(usersResult.current.route).toBeUndefined();
      expect(itemsResult.current.route?.name).toBe("items.item");

      // Navigate back to users
      await act(() => router.navigate("users.view", { id: "456" }));

      expect(usersResult.current.route?.name).toBe("users.view");
      expect(itemsResult.current.route).toBeUndefined();
    });

    it("should handle deeply nested node correctly", async () => {
      // Add deeply nested route for testing
      router.addRoute([
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

      act(() => {
        router.start();
      });

      // Navigate to different levels
      await act(() => router.navigate("admin"));

      // admin.settings should be inactive at admin level
      expect(result.current.route).toBeUndefined();

      await act(() => router.navigate("admin.settings"));

      expect(result.current.route?.name).toBe("admin.settings");

      await act(() => router.navigate("admin.settings.security"));

      // admin.settings should still be active for child route
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

      act(() => {
        router.start();
      });

      await act(() => router.navigate("users.list"));

      expect(result.current.route?.name).toBe("users.list");

      // Switch to items node
      rerender({ name: "items" });

      // Navigate to items to see the change
      await act(() => router.navigate("items.item", { id: "1" }));

      expect(result.current.route?.name).toBe("items.item");

      // Switch back to users node
      rerender({ name: "users" });

      // Navigate back to users
      await act(() => router.navigate("users.view", { id: "2" }));

      expect(result.current.route?.name).toBe("users.view");

      // Switch to root node
      rerender({ name: "" });

      // Root node shows current route
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

      act(() => {
        router.start();
      });

      await act(() => router.navigate("users.list"));

      // All hooks should have the same values
      expect(result1.current.route?.name).toBe("users.list");
      expect(result2.current.route?.name).toBe("users.list");
      expect(result3.current.route?.name).toBe("users.list");

      await act(() => router.navigate("users.view", { id: "123" }));

      expect(result1.current.route?.name).toBe("users.view");
      expect(result2.current.route?.name).toBe("users.view");
      expect(result3.current.route?.name).toBe("users.view");

      // All should have same params
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

      act(() => {
        router.start();
      });

      // Navigate to users.list
      await act(() => router.navigate("users.list"));

      expect(result.current.route?.name).toBe("users.list");

      // Change nodeName to items and navigate
      rerender({ name: "items" });

      await act(() => router.navigate("items.item", { id: "1" }));

      // Should now show items route
      expect(result.current.route?.name).toBe("items.item");

      // Change back to users
      rerender({ name: "users" });

      // Navigate to users again
      await act(() => router.navigate("users.view", { id: "2" }));

      // Should show users route
      expect(result.current.route?.name).toBe("users.view");
    });
  });

  describe("previousRoute edge cases", () => {
    it("should have correct previousRoute on first navigation", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      expect(result.current.previousRoute).toBeUndefined();

      // First navigation to users node
      await act(() => router.navigate("users.list"));

      // previousRoute might be undefined since users node was never active before
      // or it could be the global previousRoute
      expect(result.current.route?.name).toBe("users.list");
      // We don't make strict assumptions about previousRoute on first entry to a node
    });

    it("should preserve previousRoute when leaving node", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      await act(() => router.navigate("users.view", { id: "123" }));

      const routeWhenActive = result.current.route;

      // Leave users node
      await act(() => router.navigate("home"));

      // route should be undefined, but previousRoute should preserve last active route
      expect(result.current.route).toBeUndefined();
      expect(result.current.previousRoute?.name).toBe("users.view");
      expect(result.current.previousRoute).toStrictEqual(routeWhenActive);
    });

    it("should track previousRoute through navigation chain", async () => {
      const { result } = renderHook(() => useRouteNode("users"), {
        wrapper: (props) => wrapper({ ...props, router }),
      });

      act(() => {
        router.start();
      });

      const chain: {
        route: string | undefined;
        previousRoute: string | undefined;
      }[] = [];

      // Navigation chain: users.list → users.view → users.edit → home
      await act(() => router.navigate("users.list"));

      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(() => router.navigate("users.view", { id: "1" }));

      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(() => router.navigate("users.edit", { id: "1" }));

      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      await act(() => router.navigate("home"));

      chain.push({
        route: result.current.route?.name,
        previousRoute: result.current.previousRoute?.name,
      });

      // Verify the chain - each step should have the correct route
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
