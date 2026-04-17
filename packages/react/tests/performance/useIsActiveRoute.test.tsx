import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { RouterProvider } from "@real-router/react";

import { useIsActiveRoute } from "../../src/hooks/useIsActiveRoute";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe(
  "useIsActiveRoute - Performance Tests",
  { tags: ["performance"] },
  () => {
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

    describe("Initial Render", () => {
      it("should render exactly once on initial mount", () => {
        const { ProfiledHook } = profileHook(() => useIsActiveRoute("home"), {
          renderOptions: { wrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);
        expect(ProfiledHook).toHaveMountedOnce();
      });

      it("should return correct active state on mount", async () => {
        await router.navigate("home");

        const { result } = profileHook(() => useIsActiveRoute("home"), {
          renderOptions: { wrapper },
        });

        expect(result.current).toBe(true);
      });
    });

    describe("Active State Transitions", () => {
      it("should re-render only on active-state transition", async () => {
        await router.navigate("home");

        const { ProfiledHook } = profileHook(() => useIsActiveRoute("home"), {
          renderOptions: { wrapper },
        });

        ProfiledHook.snapshot();

        await act(async () => {
          await router.navigate("items");
        });

        expect(ProfiledHook).toHaveRerenderedOnce();

        await act(async () => {
          await router.navigate("about");
        });

        // home → items (toggle true→false): 1 rerender
        // items → about (no toggle, still false): 0 rerenders
        expect(ProfiledHook).toHaveRerenderedOnce();
      });

      it("should re-render when returning to active route", async () => {
        await router.navigate("home");

        const { ProfiledHook } = profileHook(() => useIsActiveRoute("home"), {
          renderOptions: { wrapper },
        });

        ProfiledHook.snapshot();

        await act(async () => {
          await router.navigate("items");
        });
        await act(async () => {
          await router.navigate("home");
        });

        // home → items (true→false) + items → home (false→true) = 2 rerenders
        expect(ProfiledHook).toHaveRerendered(2);
      });
    });

    describe("Stable params reference (useStableValue)", () => {
      it("should not re-render when params reference changes but JSON stable", async () => {
        await router.navigate("items.item", { id: "1" });

        const { ProfiledHook, rerender } = profileHook(
          (props: { params: Record<string, string> }) =>
            useIsActiveRoute("items.item", props.params),
          { params: { id: "1" } },
          { renderOptions: { wrapper } },
        );

        ProfiledHook.snapshot();

        // New reference, same JSON
        rerender({ params: { id: "1" } });
        rerender({ params: { id: "1" } });
        rerender({ params: { id: "1" } });

        // Parent re-renders propagate, but internal source does NOT recreate
        // (useStableValue keeps the same params reference in deps).
        // Hook still renders (parent propagation), but active state is stable.
        expect(ProfiledHook).toHaveRerendered(3);
      });
    });
  },
);
