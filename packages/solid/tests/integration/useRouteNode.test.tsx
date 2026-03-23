import { renderHook, render, screen } from "@solidjs/testing-library";
import { fireEvent } from "@testing-library/dom";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { useRouteNode, RouterProvider, useNavigator } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("useRouteNode - Integration Tests", () => {
  let router: Router;

  const wrapper = (props: { children: JSX.Element }) => (
    <RouterProvider router={router}>{props.children}</RouterProvider>
  );

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Basic Integration", () => {
    it("should work with RouterProvider", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route?.name).toBe("users.list");
    });

    it("should return correct RouteState structure", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result()).toHaveProperty("route");
      expect(result()).toHaveProperty("previousRoute");
    });

    it("should throw error without RouterProvider", async () => {
      await router.start("/users/list");

      expect(() => {
        renderHook(() => useRouteNode("users"));
      }).toThrow("useRouter must be used within a RouterProvider");
    });
  });

  describe("Node Subscription", () => {
    it("should subscribe to root node and receive all routes", async () => {
      await router.start("/");

      const { result } = renderHook(() => useRouteNode(""), { wrapper });

      expect(result().route?.name).toBe("test");

      await router.navigate("users.list");

      expect(result().route?.name).toBe("users.list");

      await router.navigate("about");

      expect(result().route?.name).toBe("about");
    });

    it("should subscribe to parent node and receive child routes", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route?.name).toBe("users.list");

      await router.navigate("users.view", { id: "123" });

      expect(result().route?.name).toBe("users.view");
      expect(result().route?.params).toStrictEqual({ id: "123" });
    });

    it("should return undefined route when subscribed node is not active", async () => {
      await router.start("/about");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route).toBeUndefined();
    });
  });

  describe("Navigation Integration", () => {
    it("should update when navigating within subscribed node", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route?.name).toBe("users.list");

      await router.navigate("users.view", { id: "1" });

      expect(result().route?.name).toBe("users.view");
      expect(result().previousRoute?.name).toBe("users.list");
    });

    it("should handle node becoming active", async () => {
      await router.start("/about");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route).toBeUndefined();

      await router.navigate("users.list");

      expect(result().route?.name).toBe("users.list");
    });

    it("should handle node becoming inactive", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result().route?.name).toBe("users.list");

      await router.navigate("about");

      expect(result().route).toBeUndefined();
    });
  });

  describe("Multiple Hooks", () => {
    it("should support multiple hooks with different nodes", async () => {
      await router.start("/users/list");

      const { result: usersResult } = renderHook(() => useRouteNode("users"), {
        wrapper,
      });
      const { result: itemsResult } = renderHook(() => useRouteNode("items"), {
        wrapper,
      });

      expect(usersResult().route?.name).toBe("users.list");
      expect(itemsResult().route).toBeUndefined();
    });
  });

  describe("Component Integration", () => {
    it("should work in a real component", async () => {
      await router.start("/users/list");

      function UsersList() {
        const routeState = useRouteNode("users");

        return (
          <div data-testid="route-name">
            {routeState().route ? routeState().route!.name : "No route"}
          </div>
        );
      }

      render(() => <UsersList />, { wrapper });

      expect(screen.getByTestId("route-name")).toHaveTextContent("users.list");
    });

    it("should support conditional rendering based on node activity", async () => {
      await router.start("/about");

      function UsersSection() {
        const routeState = useRouteNode("users");

        return (
          <div>
            {routeState().route ? (
              <div data-testid="active">Users: {routeState().route!.name}</div>
            ) : (
              <div data-testid="inactive">Users section inactive</div>
            )}
          </div>
        );
      }

      render(() => <UsersSection />, { wrapper });

      expect(screen.getByTestId("inactive")).toBeInTheDocument();

      await router.navigate("users.list");

      expect(screen.getByTestId("active")).toHaveTextContent(
        "Users: users.list",
      );
    });

    it("should provide navigator for programmatic navigation", async () => {
      await router.start("/users/list");

      function NavigationComponent() {
        const routeState = useRouteNode("users");
        const navigator = useNavigator();

        return (
          <div>
            <span data-testid="current-route">
              {routeState().route?.name ?? "none"}
            </span>
            <button
              data-testid="navigate-btn"
              onClick={() => {
                void navigator.navigate("users.view", { id: "1" });
              }}
            >
              Navigate
            </button>
          </div>
        );
      }

      render(() => <NavigationComponent />, { wrapper });

      expect(screen.getByTestId("current-route")).toHaveTextContent(
        "users.list",
      );

      fireEvent.click(screen.getByTestId("navigate-btn"));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByTestId("current-route")).toHaveTextContent(
        "users.view",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent node subscription", async () => {
      await router.start("/users/list");

      const { result } = renderHook(
        () => useRouteNode("nonexistent.node.path"),
        { wrapper },
      );

      expect(result().route).toBeUndefined();
    });

    it("should handle rapid navigation", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.edit", { id: "1" });
      await router.navigate("users.view", { id: "2" });

      expect(result().route?.name).toBe("users.view");
      expect(result().route?.params).toStrictEqual({ id: "2" });
    });

    it("should handle unmount during navigation", async () => {
      await router.start("/users/list");

      const { cleanup } = renderHook(() => useRouteNode("users"), { wrapper });

      await router.navigate("users.view", { id: "1" });

      cleanup();

      expect(router.getState()?.name).toBe("users.view");
    });
  });
});
