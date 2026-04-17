import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useNavigator, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe("useNavigator - Performance Tests", { tags: ["performance"] }, () => {
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
      const { ProfiledHook } = profileHook(() => useNavigator(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should never re-render across multiple navigations", async () => {
      const { ProfiledHook } = profileHook(() => useNavigator(), {
        renderOptions: { wrapper },
      });

      ProfiledHook.snapshot();

      await act(async () => {
        await router.navigate("about");
      });
      await act(async () => {
        await router.navigate("home");
      });
      await act(async () => {
        await router.navigate("items");
      });

      expect(ProfiledHook).toNotHaveRerendered();
    });

    it("should return stable navigator reference across re-renders", () => {
      const { result, rerender } = profileHook(() => useNavigator(), {
        renderOptions: { wrapper },
      });

      const first = result.current;

      rerender();
      rerender();

      expect(result.current).toBe(first);
    });

    it("navigator should expose stable method references", () => {
      const { result, rerender } = profileHook(() => useNavigator(), {
        renderOptions: { wrapper },
      });

      const firstNavigate = result.current.navigate;
      const firstGetState = result.current.getState;
      const firstIsActive = result.current.isActiveRoute;
      const firstSubscribe = result.current.subscribe;

      rerender();

      expect(result.current.navigate).toBe(firstNavigate);
      expect(result.current.getState).toBe(firstGetState);
      expect(result.current.isActiveRoute).toBe(firstIsActive);
      expect(result.current.subscribe).toBe(firstSubscribe);
    });
  });
});
