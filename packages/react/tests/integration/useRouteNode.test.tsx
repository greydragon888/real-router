import {
  renderHook,
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { useState } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { useRouteNode, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("useRouteNode - Integration Tests", () => {
  let router: Router;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
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

      expect(result.current.navigator).toBeDefined();
      expect(result.current.route?.name).toBe("users.list");
    });

    it("should return correct RouteContext structure", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current).toHaveProperty("navigator");
      expect(result.current).toHaveProperty("route");
      expect(result.current).toHaveProperty("previousRoute");
    });

    it("should throw error without RouterProvider", async () => {
      await router.start("/users/list");

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useRouteNode("users"));
      }).toThrowError("useRouter must be used within a RouterProvider");

      consoleSpy.mockRestore();
    });

    it("should return undefined previousRoute on initial render", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.previousRoute).toBeUndefined();
    });
  });

  describe("Node Subscription", () => {
    it("should subscribe to root node and receive all routes", async () => {
      await router.start("/");

      const { result } = renderHook(() => useRouteNode(""), { wrapper });

      expect(result.current.route?.name).toBe("test");

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("about");
      });

      expect(result.current.route?.name).toBe("about");
    });

    it("should subscribe to parent node and receive child routes", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "123" });
    });

    it("should return undefined route when subscribed node is not active", async () => {
      await router.start("/about");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route).toBeUndefined();
    });

    it("should subscribe to exact child node", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users.list"), {
        wrapper,
      });

      expect(result.current.route?.name).toBe("users.list");

      // Navigate to sibling - should become undefined
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(result.current.route).toBeUndefined();
    });
  });

  describe("Navigation Integration", () => {
    it("should update when navigating within subscribed node", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.previousRoute?.name).toBe("users.list");
    });

    it("should track previousRoute correctly through multiple navigations", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(result.current.previousRoute?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(result.current.previousRoute?.name).toBe("users.view");
    });

    it("should handle node becoming active", async () => {
      await router.start("/about");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route).toBeUndefined();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route?.name).toBe("users.list");
    });

    it("should handle node becoming inactive", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("about");
      });

      expect(result.current.route).toBeUndefined();
    });

    it("should not update for navigation outside subscribed node", async () => {
      await router.start("/about");

      let renderCount = 0;
      const { result } = renderHook(
        () => {
          renderCount++;

          return useRouteNode("users");
        },
        { wrapper },
      );

      // eslint-disable-next-line testing-library/render-result-naming-convention
      const initialRenderCount = renderCount;

      expect(result.current.route).toBeUndefined();

      // Navigate to another route outside users node
      await act(async () => {
        await router.navigate("home");
      });

      // Should not have re-rendered (route is still undefined)
      expect(result.current.route).toBeUndefined();
      expect(renderCount).toBe(initialRenderCount);
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

      expect(usersResult.current.route?.name).toBe("users.list");
      expect(itemsResult.current.route).toBeUndefined();
    });

    it("should update only relevant hooks on navigation", async () => {
      await router.start("/users/list");

      let usersRenderCount = 0;
      let itemsRenderCount = 0;

      renderHook(
        () => {
          usersRenderCount++;

          return useRouteNode("users");
        },
        { wrapper },
      );

      renderHook(
        () => {
          itemsRenderCount++;

          return useRouteNode("items");
        },
        { wrapper },
      );

      // eslint-disable-next-line testing-library/render-result-naming-convention
      const initialUsersCount = usersRenderCount;
      // eslint-disable-next-line testing-library/render-result-naming-convention
      const initialItemsCount = itemsRenderCount;

      const { result: usersResult } = renderHook(() => useRouteNode("users"), {
        wrapper,
      });

      const { result: itemsResult } = renderHook(() => useRouteNode("items"), {
        wrapper,
      });

      // Navigate within users node
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(usersResult.current.route?.name).toBe("users.view");
      expect(usersRenderCount).toBeGreaterThan(initialUsersCount);

      // Items hook should not have re-rendered
      expect(itemsResult.current.route).toBeUndefined();
      expect(itemsRenderCount).toBe(initialItemsCount);
    });

    it("should handle root and child subscriptions independently", async () => {
      await router.start("/users/list");

      const { result: rootResult } = renderHook(() => useRouteNode(""), {
        wrapper,
      });
      const { result: usersResult } = renderHook(() => useRouteNode("users"), {
        wrapper,
      });

      // Both should see the route
      expect(rootResult.current.route?.name).toBe("users.list");
      expect(usersResult.current.route?.name).toBe("users.list");

      // Navigate to about
      await act(async () => {
        await router.navigate("about");
      });

      // Root sees the route, users node doesn't
      expect(rootResult.current.route?.name).toBe("about");
      expect(usersResult.current.route).toBeUndefined();
    });
  });

  describe("Component Integration", () => {
    it("should work in a real component", async () => {
      await router.start("/users/list");

      const UsersList: FC = () => {
        const { route } = useRouteNode("users");

        if (!route) {
          return <div data-testid="no-route">No route</div>;
        }

        return <div data-testid="route-name">{route.name}</div>;
      };

      render(<UsersList />, { wrapper });

      expect(screen.getByTestId("route-name")).toHaveTextContent("users.list");
    });

    it("should support conditional rendering based on node activity", async () => {
      await router.start("/about");

      const UsersSection: FC = () => {
        const { route } = useRouteNode("users");

        if (!route) {
          return <div data-testid="inactive">Users section inactive</div>;
        }

        return <div data-testid="active">Users: {route.name}</div>;
      };

      render(<UsersSection />, { wrapper });

      expect(screen.getByTestId("inactive")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(screen.getByTestId("active")).toHaveTextContent(
        "Users: users.list",
      );
    });

    it("should update component when route params change", async () => {
      await router.start("/users/list");

      const UserView: FC = () => {
        const { route } = useRouteNode("users");
        const id =
          route?.params &&
          typeof route.params === "object" &&
          "id" in route.params &&
          typeof route.params.id === "string"
            ? route.params.id
            : "no-id";

        return <div data-testid="user-id">{id}</div>;
      };

      render(<UserView />, { wrapper });

      expect(screen.getByTestId("user-id")).toHaveTextContent("no-id");

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("user-id")).toHaveTextContent("123");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "456" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("user-id")).toHaveTextContent("456");
      });
    });

    it("should provide router for programmatic navigation", async () => {
      await router.start("/users/list");

      const NavigationComponent: FC = () => {
        const { navigator: contextNavigator, route } = useRouteNode("users");

        return (
          <div>
            <span data-testid="current-route">{route?.name ?? "none"}</span>
            <button
              data-testid="navigate-btn"
              onClick={() => {
                contextNavigator.navigate("users.view", { id: "1" });
              }}
            >
              Navigate
            </button>
          </div>
        );
      };

      render(<NavigationComponent />, { wrapper });

      expect(screen.getByTestId("current-route")).toHaveTextContent(
        "users.list",
      );

      fireEvent.click(screen.getByTestId("navigate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("current-route")).toHaveTextContent(
          "users.view",
        );
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle dynamic nodeName changes", async () => {
      await router.start("/users/list");

      const { result, rerender } = renderHook(
        ({ nodeName }) => useRouteNode(nodeName),
        {
          wrapper,
          initialProps: { nodeName: "users" },
        },
      );

      expect(result.current.route?.name).toBe("users.list");

      // Change nodeName to items and navigate to items route
      rerender({ nodeName: "items" });

      // Navigate to items route - now the hook should return the route
      await act(async () => {
        await router.navigate("items");
      });

      expect(result.current.route?.name).toBe("items");

      // Navigate back to users - should be undefined since we're subscribed to items
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(result.current.route).toBeUndefined();
    });

    it("should handle non-existent node subscription", async () => {
      await router.start("/users/list");

      const { result } = renderHook(
        () => useRouteNode("nonexistent.node.path"),
        { wrapper },
      );

      // Should return undefined route for non-matching node
      expect(result.current.route).toBeUndefined();
      expect(result.current.navigator).toBeDefined();
    });

    it("should handle router restart", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      expect(result.current.route?.name).toBe("users.list");

      // Stop and restart router
      await act(async () => {
        router.stop();
        await router.start("/about");
      });

      // After restart, the component should still work
      // (though route might be stale until next navigation)
      expect(result.current.navigator).toBeDefined();
    });

    it("should handle rapid navigation", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      // Rapid sequential navigations
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      await waitFor(() => {
        expect(result.current.route?.name).toBe("users.view");
      });

      expect(result.current.route?.params).toStrictEqual({ id: "2" });
    });

    it("should maintain reference equality for unchanged values", async () => {
      await router.start("/users/list");

      const { result } = renderHook(() => useRouteNode("users"), { wrapper });

      const initialNavigator = result.current.navigator;

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      // Navigator reference should be stable
      expect(result.current.navigator).toBe(initialNavigator);
    });
  });

  describe("State Component Integration", () => {
    it("should work with component local state", async () => {
      await router.start("/users/list");

      const StatefulComponent: FC = () => {
        const { route } = useRouteNode("users");
        const [count, setCount] = useState(0);

        return (
          <div>
            <span data-testid="route">{route?.name ?? "none"}</span>
            <span data-testid="count">{count}</span>
            <button
              data-testid="increment"
              onClick={() => {
                setCount((c) => c + 1);
              }}
            >
              +
            </button>
          </div>
        );
      };

      render(<StatefulComponent />, { wrapper });

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");
      expect(screen.getByTestId("count")).toHaveTextContent("0");

      // Increment local state
      fireEvent.click(screen.getByTestId("increment"));

      expect(screen.getByTestId("count")).toHaveTextContent("1");

      // Navigate
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("users.view");
      });

      // Local state should be preserved
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    it("should handle unmount during navigation", async () => {
      await router.start("/users/list");

      const { unmount } = renderHook(() => useRouteNode("users"), { wrapper });

      // Start navigation
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      // Unmount during/after navigation
      unmount();

      // Should not throw or cause errors
      expect(router.getState()?.name).toBe("users.view");
    });
  });
});
