import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { profileHook } from "vitest-react-profiler";

import { useRouterTransition, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

describe(
  "useRouterTransition - Performance Tests",
  { tags: ["performance"] },
  () => {
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
        await router.start("/");

        const { ProfiledHook } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);
        expect(ProfiledHook).toHaveMountedOnce();
      });

      it("should return isTransitioning: false on mount", async () => {
        await router.start("/");

        const { result } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper },
        });

        expect(result.current.isTransitioning).toBe(false);
      });
    });

    describe("Sync Guards", () => {
      it("should return IDLE after sync navigation", async () => {
        await router.start("/");

        const { result } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper },
        });

        await act(async () => {
          await router.navigate("home");
        });

        expect(result.current.isTransitioning).toBe(false);
        expect(result.current.toRoute).toBeNull();
        expect(result.current.fromRoute).toBeNull();
      });

      it("should return IDLE after multiple sequential sync navigations", async () => {
        await router.start("/");

        const { result } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper },
        });

        await act(async () => {
          await router.navigate("home");
          await router.navigate("about");
          await router.navigate("home");
        });

        expect(result.current.isTransitioning).toBe(false);
      });
    });

    describe("Async Guards", () => {
      it("should re-render exactly twice per async transition (start + end)", async () => {
        const asyncRouter = createRouter([
          { name: "home", path: "/" },
          { name: "dashboard", path: "/dashboard" },
        ]);

        const lifecycle = getLifecycleApi(asyncRouter);
        let resolveGuard!: (value: boolean) => void;

        lifecycle.addActivateGuard("dashboard", () => () => {
          return new Promise<boolean>((resolve) => {
            resolveGuard = resolve;
          });
        });

        await asyncRouter.start("/");

        const asyncWrapper = ({ children }: { children: ReactNode }) => (
          <RouterProvider router={asyncRouter}>{children}</RouterProvider>
        );

        const { ProfiledHook } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper: asyncWrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);

        await act(async () => {
          void asyncRouter.navigate("dashboard");
          await Promise.resolve();
        });

        expect(ProfiledHook).toHaveRenderedTimes(2);

        await act(async () => {
          resolveGuard(true);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(ProfiledHook).toHaveRenderedTimes(3);

        expect(ProfiledHook).toMeetRenderCountBudget({
          maxRenders: 3,
          maxMounts: 1,
          maxUpdates: 2,
          componentName: "useRouterTransition",
        });

        asyncRouter.stop();
      });

      it("should re-render twice on TRANSITION_ERROR (start + error)", async () => {
        const asyncRouter = createRouter([
          { name: "home", path: "/" },
          { name: "dashboard", path: "/dashboard" },
        ]);

        const lifecycle = getLifecycleApi(asyncRouter);
        let resolveGuard!: (value: boolean) => void;

        lifecycle.addActivateGuard("dashboard", () => () => {
          return new Promise<boolean>((resolve) => {
            resolveGuard = resolve;
          });
        });

        await asyncRouter.start("/");

        const asyncWrapper = ({ children }: { children: ReactNode }) => (
          <RouterProvider router={asyncRouter}>{children}</RouterProvider>
        );

        const { ProfiledHook } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper: asyncWrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);

        await act(async () => {
          void asyncRouter.navigate("dashboard").catch(() => {});
          await Promise.resolve();
        });

        expect(ProfiledHook).toHaveRenderedTimes(2);

        await act(async () => {
          resolveGuard(false);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(ProfiledHook).toHaveRenderedTimes(3);

        asyncRouter.stop();
      });

      it("should re-render on TRANSITION_CANCEL", async () => {
        const asyncRouter = createRouter([
          { name: "home", path: "/" },
          { name: "dashboard", path: "/dashboard" },
          { name: "settings", path: "/settings" },
        ]);

        const lifecycle = getLifecycleApi(asyncRouter);
        let resolveGuard!: (value: boolean) => void;

        lifecycle.addActivateGuard("dashboard", () => () => {
          return new Promise<boolean>((resolve) => {
            resolveGuard = resolve;
          });
        });

        await asyncRouter.start("/");

        const asyncWrapper = ({ children }: { children: ReactNode }) => (
          <RouterProvider router={asyncRouter}>{children}</RouterProvider>
        );

        const { result } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper: asyncWrapper },
        });

        await act(async () => {
          const p1 = asyncRouter.navigate("dashboard");

          await Promise.resolve();

          const p2 = asyncRouter.navigate("settings");

          resolveGuard(true);
          await p2;
          await p1.catch(() => {});
        });

        expect(result.current.isTransitioning).toBe(false);
        expect(result.current.toRoute).toBeNull();

        asyncRouter.stop();
      });
    });

    describe("navigateToNotFound", () => {
      it("should NOT re-render (no TRANSITION_START emitted)", async () => {
        await router.start("/");

        const { ProfiledHook } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);

        ProfiledHook.snapshot();

        act(() => {
          router.navigateToNotFound("/unknown");
        });

        expect(ProfiledHook).toNotHaveRerendered();
      });
    });

    describe("Sequential Async Transitions", () => {
      it("should scale linearly: N async transitions = 2N re-renders", async () => {
        const asyncRouter = createRouter([
          { name: "home", path: "/" },
          { name: "a", path: "/a" },
          { name: "b", path: "/b" },
          { name: "c", path: "/c" },
        ]);

        const routes = ["a", "b", "c"];
        const resolvers: ((value: boolean) => void)[] = [];

        const lifecycle = getLifecycleApi(asyncRouter);

        for (const route of routes) {
          lifecycle.addActivateGuard(route, () => () => {
            return new Promise<boolean>((resolve) => {
              resolvers.push(resolve);
            });
          });
        }

        await asyncRouter.start("/");

        const asyncWrapper = ({ children }: { children: ReactNode }) => (
          <RouterProvider router={asyncRouter}>{children}</RouterProvider>
        );

        const { ProfiledHook } = profileHook(() => useRouterTransition(), {
          renderOptions: { wrapper: asyncWrapper },
        });

        expect(ProfiledHook).toHaveRenderedTimes(1);

        for (const [i, route] of routes.entries()) {
          await act(async () => {
            void asyncRouter.navigate(route);
            await Promise.resolve();
          });

          await act(async () => {
            resolvers[i](true);
            await Promise.resolve();
            await Promise.resolve();
          });
        }

        expect(ProfiledHook).toMeetRenderCountBudget({
          maxRenders: 1 + 2 * routes.length,
          maxMounts: 1,
          maxUpdates: 2 * routes.length,
          componentName: "useRouterTransition",
        });

        asyncRouter.stop();
      });
    });
  },
);
