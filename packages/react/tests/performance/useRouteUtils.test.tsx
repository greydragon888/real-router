import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouteUtils, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe("useRouteUtils - Performance Tests", { tags: ["performance"] }, () => {
  let router: Router;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  describe("Contract: never re-renders on navigation (gotcha)", () => {
    it("should render exactly once on initial mount", () => {
      const { ProfiledHook } = profileHook(() => useRouteUtils(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should never re-render across multiple navigations", async () => {
      const { ProfiledHook } = profileHook(() => useRouteUtils(), {
        renderOptions: { wrapper },
      });

      ProfiledHook.snapshot();

      await act(async () => {
        await router.navigate("about");
      });
      await act(async () => {
        await router.navigate("home");
      });

      expect(ProfiledHook).toNotHaveRerendered();
    });
  });

  describe("WeakMap cache: stable reference per router", () => {
    it("should return same RouteUtils instance across re-renders (no recomputation)", () => {
      const { result, rerender } = profileHook(() => useRouteUtils(), {
        renderOptions: { wrapper },
      });

      const first = result.current;

      rerender();
      rerender();
      rerender();

      expect(result.current).toBe(first);
    });

    it("should return same RouteUtils instance after navigation", async () => {
      const { result } = profileHook(() => useRouteUtils(), {
        renderOptions: { wrapper },
      });

      const first = result.current;

      await act(async () => {
        await router.navigate("about");
      });

      expect(result.current).toBe(first);
    });

    it("should expose RouteUtils methods with stable references", () => {
      const { result, rerender } = profileHook(() => useRouteUtils(), {
        renderOptions: { wrapper },
      });

      // Capture object reference — all methods live on the same instance.
      const firstUtils = result.current;

      rerender();

      expect(result.current).toBe(firstUtils);
    });
  });
});
