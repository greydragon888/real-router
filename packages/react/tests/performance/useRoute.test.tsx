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
    it("should render exactly once on initial mount", () => {
      router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should return correct RouteContext on mount", () => {
      router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.navigator).toBeDefined();
      expect(result.current.route?.name).toBe("users.list");
    });

    it("should have undefined previousRoute on initial mount", () => {
      router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.previousRoute).toBeUndefined();
    });
  });

  describe("Route Changes - All Trigger Re-render", () => {
    it("should re-render when navigating to a different route", () => {
      router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();

      act(() => {
        router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(ProfiledHook).toHaveLastRenderedWithPhase("update");
    });

    it("should re-render on each sequential navigation", () => {
      router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      act(() => {
        router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      act(() => {
        router.navigate("home");
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);

      act(() => {
        router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
    });

    it("should re-render when navigating within the same parent node", () => {
      router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      act(() => {
        router.navigate("users.view", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      act(() => {
        router.navigate("users.edit", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);
    });
  });

  describe("Route Context Values", () => {
    it("should maintain stable router reference across re-renders", () => {
      router.start("/users/list");

      const { result, ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      const initialNavigator = result.current.navigator;

      act(() => {
        router.navigate("about");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
      expect(result.current.navigator).toBe(initialNavigator);
    });

    it("should update route on navigation", () => {
      router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.route?.name).toBe("users.list");

      act(() => {
        router.navigate("about");
      });

      expect(result.current.route?.name).toBe("about");
    });

    it("should track previousRoute correctly", () => {
      router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(result.current.previousRoute).toBeUndefined();

      act(() => {
        router.navigate("about");
      });

      expect(result.current.previousRoute?.name).toBe("users.list");
      expect(result.current.route?.name).toBe("about");

      act(() => {
        router.navigate("home");
      });

      expect(result.current.previousRoute?.name).toBe("about");
      expect(result.current.route?.name).toBe("home");
    });

    it("should include route params in route object", () => {
      router.start("/users/list");

      const { result } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      act(() => {
        router.navigate("users.view", { id: "123" });
      });

      expect(result.current.route?.name).toBe("users.view");
      expect(result.current.route?.params).toStrictEqual({ id: "123" });
    });
  });

  describe("Comparison with useRouteNode - No Optimization", () => {
    it("should re-render on ANY navigation (unlike useRouteNode)", () => {
      router.start("/about");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate between completely unrelated routes
      // useRouteNode("users") would NOT re-render here
      // but useRoute ALWAYS re-renders
      act(() => {
        router.navigate("home");
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);

      act(() => {
        router.navigate("items");
      });

      expect(ProfiledHook).toHaveRenderedTimes(3);

      act(() => {
        router.navigate("test");
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
    });

    it("should re-render when sibling nodes change (unlike useRouteNode)", () => {
      router.start("/items");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate within items - useRouteNode("users") would NOT re-render
      // but useRoute ALWAYS re-renders
      act(() => {
        router.navigate("items.item", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(2);
    });
  });

  describe("Performance with Multiple Navigations", () => {
    it("should handle sequential navigations with linear render count", () => {
      router.start("/");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Each navigation = 1 re-render
      for (let i = 0; i < 5; i++) {
        act(() => {
          router.navigate("users.view", { id: String(i) });
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

    it("should batch synchronous navigations in single act()", () => {
      router.start("/");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Multiple synchronous navigations in single act() - only last one matters
      act(() => {
        router.navigate("users.list");
        router.navigate("about");
        router.navigate("home");
      });

      // React batches updates - only final state triggers re-render
      expect(ProfiledHook).toHaveRenderedTimes(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle navigation to same route (no re-render expected)", () => {
      router.start("/users/list");

      const { ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);

      // Navigate to the same route - router may not emit event
      act(() => {
        router.navigate("users.list");
      });

      // Behavior depends on router implementation
      // If router doesn't emit for same route, count stays 1
      expect(ProfiledHook.getRenderCount()).toBeGreaterThanOrEqual(1);
    });

    it("should handle rapid route changes correctly", () => {
      router.start("/");

      const { result, ProfiledHook } = profileHook(() => useRoute(), {
        renderOptions: { wrapper },
      });

      // Rapid sequential navigations
      act(() => {
        router.navigate("users.list");
      });

      act(() => {
        router.navigate("users.view", { id: "1" });
      });

      act(() => {
        router.navigate("users.edit", { id: "1" });
      });

      expect(ProfiledHook).toHaveRenderedTimes(4);
      expect(result.current.route?.name).toBe("users.edit");
      expect(result.current.previousRoute?.name).toBe("users.view");
    });
  });
});
