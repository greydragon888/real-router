import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouter, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe("useRouter - Performance Tests", { tags: ["performance"] }, () => {
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
      const { ProfiledHook } = profileHook(() => useRouter(), {
        renderOptions: { wrapper },
      });

      expect(ProfiledHook).toHaveRenderedTimes(1);
      expect(ProfiledHook).toHaveMountedOnce();
    });

    it("should never re-render across multiple navigations", async () => {
      const { ProfiledHook } = profileHook(() => useRouter(), {
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

    it("should return stable router reference across re-renders", () => {
      const { result, rerender, ProfiledHook } = profileHook(
        () => useRouter(),
        { renderOptions: { wrapper } },
      );

      const first = result.current;

      rerender();
      rerender();

      expect(result.current).toBe(first);
      expect(ProfiledHook).toHaveRenderedTimes(3);
    });

    it("should return the exact router instance provided", () => {
      const { result } = profileHook(() => useRouter(), {
        renderOptions: { wrapper },
      });

      expect(result.current).toBe(router);
    });
  });
});
