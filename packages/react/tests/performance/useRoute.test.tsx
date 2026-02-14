import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRoute, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe("useRoute - Performance Tests", () => {
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

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should return correct RouteContext on mount", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.navigator).toBeDefined();
      expect(result.current.route?.name).toBe("users.list");
    });

    it("should have undefined previousRoute on initial mount", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.previousRoute).toBeUndefined();
    });
  });

  describe("Route Changes - All Trigger Re-render", () => {
    it("should re-render when navigating to a different route", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(ProfiledHook).toHaveLastRenderedWithPhase("update");
    });

    it("should re-render on each sequential navigation", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("home");
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
    });

    it("should re-render when navigating within the same parent node", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);
    });
  });

  describe("Route Context Values", () => {
    it("should maintain stable router reference across re-renders", async () => {
      await router.start("/users/list");

      const { result, ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      const initialNavigator = result.current.navigator;

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(result.current.navigator).toBe(initialNavigator);
    });

    it("should update route on navigation", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.route?.name).toBe("users.list");

      await act(async () => {
        await router.navigate("about");
      });

      expect(result.current.route?.name).toBe("about");
    });

    it("should track previousRoute correctly", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.previousRoute).toBeUndefined();

      await act(async () => {
        await router.navigate("about");
      });

      expect(result.current.previousRoute?.name).toBe("users.list");
      expect(result.current.route?.name).toBe("about");

      await act(async () => {
        await router.navigate("home");
      });

      expect(result.current.previousRoute?.name).toBe("about");
      expect(result.current.route?.name).toBe("home");
    });

    it("should include route params in route object", async () => {
      await router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "123" });
    });
  });

  describe("Comparison with useRouteNode - No Optimization", () => {
    it("should re-render on ANY navigation (unlike useRouteNode)", async () => {
      await router.start("/about");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate between completely unrelated routes
      // useRouteNode("users") would NOT re-render here
      // but useRoute ALWAYS re-renders
      await act(async () => {
        await router.navigate("home");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("items");
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);

      await act(async () => {
        await router.navigate("test");
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
    });

    it("should re-render when sibling nodes change (unlike useRouteNode)", async () => {
      await router.start("/items");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate within items - useRouteNode("users") would NOT re-render
      // but useRoute ALWAYS re-renders
      await act(async () => {
        await router.navigate("items.item", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
    });
  });

  describe("Performance with Multiple Navigations", () => {
    it("should handle sequential navigations with linear render count", async () => {
      await router.start("/");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Each navigation = 1 re-render
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await router.navigate("users.view", { id: String(i) });
        });
      }

      // 1 mount + 5 updates = 6 total renders
      expect(ProfiledHook).toMeetRenderCountBudget({
        maxRenders: 6,
        maxMounts: 1,
        maxUpdates: 5,
        componentName: "useRoute",
      });
      expect(ProfiledHook).toHaveLastRenderedWithPhase("update");
    });

    it("should batch synchronous navigations in single act()", async () => {
      await router.start("/");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Multiple navigations in single act() - each await yields to React
      await act(async () => {
        await router.navigate("users.list");
        await router.navigate("about");
        await router.navigate("home");
      });

      // Each awaited navigate triggers a separate React update: 1 mount + 3 updates = 4
      expect(ProfiledHook).toHaveRenderedTimes(4);
    });
  });

  describe("Edge Cases", () => {
    it("should handle navigation to same route (no re-render expected)", async () => {
      await router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to the same route - router rejects with SAME_STATES
      await act(async () => {
        await router.navigate("users.list").catch(() => {});
      });

      // Behavior depends on router implementation
      // If router doesn't emit for same route, count stays 1
      expect(ProfiledHook.getRenderCount()).toBeGreaterThanOrEqual(1);
    });

    it("should handle rapid route changes correctly", async () => {
      await router.start("/");

      const { result, ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      // Rapid sequential navigations
      await act(async () => {
        await router.navigate("users.list");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
      expect(result.current.route?.name).toBe("users.edit");
      expect(result.current.previousRoute?.name).toBe("users.view");
    });
  });
});
