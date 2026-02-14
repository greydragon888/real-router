import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouteNode, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe("useRouteNode - Performance Tests", () => {
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

  describe("Initial Render", () => {
    it("should render exactly once on initial mount", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should return correct RouteContext on mount", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(result.current.navigator).toBeDefined();
      expect(result.current.route?.name).toBe("users.list");
    });

    it("should return undefined route when node is not active", async () => {
      await router.start("/about");

      const { result } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(result.current.route).toBeUndefined();
    });
  });

  describe("Route Changes - Same Node", () => {
    it("should re-render when navigating within the same node", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();

      // Navigate within the same node (users.list -> users.view)
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(ProfiledHook).toHaveLastRenderedWithPhase("update");
    });

    it("should re-render on each navigation within the node", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Multiple navigations within users node
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
    });
  });

  describe("Route Changes - Different Node (Optimization)", () => {
    it("should re-render when navigating away (node becomes inactive)", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to a completely different node - route becomes undefined
      await act(async () => {
        await router.navigate("about");
      });

      // Should re-render because route changes to undefined
      expect(ProfiledHook).toHaveRenderedTimes(2);
    });

    it("should NOT re-render when navigating between unrelated nodes", async () => {
      await router.start("/about");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Snapshot before navigation
      ProfiledHook.snapshot();

      // Navigate to another unrelated node
      await act(async () => {
        await router.navigate("home");
      });

      // Should NOT re-render - node was inactive and stays inactive
      expect(ProfiledHook).toNotHaveRerendered();
    });

    it("should NOT re-render when navigating between sibling routes of different parent", async () => {
      await router.start("/items");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Snapshot before navigation
      ProfiledHook.snapshot();

      // Navigate within items (different parent)
      await act(async () => {
        await router.navigate("items.item", { id: "123" });
      });

      // Should NOT re-render - users node is not affected
      expect(ProfiledHook).toNotHaveRerendered();
    });
  });

  describe("Node Activation/Deactivation", () => {
    it("should re-render when node becomes active", async () => {
      await router.start("/about");

      const { result, ProfiledHook } = profileHook(
        () => useRouteNode("users"),
        { renderOptions: { wrapper } },
      );

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to users node - becomes active
      await act(async () => {
        await router.navigate("users.list");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(result.current.route?.name).toBe("users.list");
    });

    it("should re-render when node becomes inactive", async () => {
      await router.start("/users/list");

      const { result, ProfiledHook } = profileHook(
        () => useRouteNode("users"),
        { renderOptions: { wrapper } },
      );

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate away from users node - becomes inactive
      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(result.current.route).toBeUndefined();
    });

    it("should handle activation -> deactivation -> activation cycle", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Deactivate
      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      // Reactivate
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);
    });
  });

  describe("Nested Routes", () => {
    it("parent node should re-render when navigating to child route", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to child route
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      // Parent should re-render
      expect(ProfiledHook).toHaveRenderedTimes(2);
    });

    it("child node should NOT re-render when navigating to sibling", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users.view"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Snapshot before navigation
      ProfiledHook.snapshot();

      // Navigate to sibling route (list -> edit)
      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      // Child (users.view) should NOT re-render - it's not on the path
      expect(ProfiledHook).toNotHaveRerendered();
    });

    it("child node should re-render only when directly affected", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users.view"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to users.view
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      // Now it should re-render because we're on users.view
      expect(ProfiledHook).toHaveRenderedTimes(2);
    });
  });

  describe("Root Node", () => {
    it("should re-render on any route change when subscribed to root", async () => {
      await router.start("/");

      const { ProfiledHook } = profileHook(() => useRouteNode(""), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);
    });
  });

  describe("Performance with Multiple Navigations", () => {
    it("should handle sequential navigation efficiently", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Sequential navigations - each in separate act()
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await router.navigate("users.view", { id: String(i) });
        });
      }

      // Should have rendered for each navigation + initial
      // 1 mount + 5 updates = 6 total renders
      expect(ProfiledHook).toMeetRenderCountBudget({
        maxRenders: 6,
        maxMounts: 1,
        maxUpdates: 5,
        componentName: "useRouteNode",
      });
      expect(ProfiledHook).toHaveLastRenderedWithPhase("update");
    });

    it("should not re-render during rapid navigation to unrelated nodes", async () => {
      await router.start("/about");

      const { ProfiledHook } = profileHook(() => useRouteNode("users"), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Snapshot before rapid navigation
      ProfiledHook.snapshot();

      // Rapid navigation to unrelated nodes
      await act(async () => {
        await router.navigate("home");
        await router.navigate("about");
        await router.navigate("test");
        await router.navigate("home");
      });

      // None of these affect users node - should NOT re-render
      expect(ProfiledHook).toNotHaveRerendered();
    });
  });
});
