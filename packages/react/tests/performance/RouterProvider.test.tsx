import { render, act } from "@testing-library/react";
import { memo, useContext } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { withProfiler } from "vitest-react-profiler";

import {
  RouterProvider,
  RouterContext,
  RouteContext,
} from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

describe("RouterProvider - Performance Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Initial Render", () => {
    it("should render exactly once on initial mount", async () => {
      await router.start("/users/list");

      const ProfiledProvider = withProfiler(RouterProvider);

      render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);
      expect(ProfiledProvider).toHaveMountedOnce();
    });

    it("should render children on mount", async () => {
      await router.start("/users/list");

      const ChildComponent: FC = () => <div data-testid="child">Child</div>;
      const ProfiledChild = withProfiler(ChildComponent);

      render(
        <RouterProvider router={router}>
          <ProfiledChild />
        </RouterProvider>,
      );

      expect(ProfiledChild).toHaveRenderedTimes(1);
      expect(ProfiledChild).toHaveMountedOnce();
    });
  });

  describe("Route Navigation - Provider Re-renders", () => {
    it("should re-render on route navigation", async () => {
      await router.start("/users/list");

      const ProfiledProvider = withProfiler(RouterProvider);

      render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);
      expect(ProfiledProvider).toHaveMountedOnce();

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledProvider).toHaveRenderedTimes(2);
      expect(ProfiledProvider).toHaveLastRenderedWithPhase("update");
    });

    it("should re-render on each navigation", async () => {
      await router.start("/");

      const ProfiledProvider = withProfiler(RouterProvider);

      render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(ProfiledProvider).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledProvider).toHaveRenderedTimes(3);

      await act(async () => {
        await router.navigate("home");
      });

      expect(ProfiledProvider).toHaveRenderedTimes(4);
    });
  });

  describe("Children Re-render Behavior", () => {
    it("should NOT re-render memoized children that don't use context", async () => {
      await router.start("/users/list");

      const PureChild: FC = memo(() => <div>Pure Child</div>);
      const ProfiledPureChild = withProfiler(PureChild);

      render(
        <RouterProvider router={router}>
          <ProfiledPureChild />
        </RouterProvider>,
      );

      expect(ProfiledPureChild).toHaveRenderedTimes(1);

      // Snapshot before navigation
      ProfiledPureChild.snapshot();

      // Navigate - Provider re-renders but memoized child without context should NOT
      await act(async () => {
        await router.navigate("about");
      });

      // Memoized component without context dependency should NOT re-render
      expect(ProfiledPureChild).toNotHaveRerendered();
    });

    it("should re-render children that consume RouteContext", async () => {
      await router.start("/users/list");

      const RouteConsumer: FC = () => {
        const context = useContext(RouteContext);

        return <div>{context?.route?.name}</div>;
      };
      const ProfiledConsumer = withProfiler(RouteConsumer);

      render(
        <RouterProvider router={router}>
          <ProfiledConsumer />
        </RouterProvider>,
      );

      expect(ProfiledConsumer).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("about");
      });

      // Component consuming RouteContext SHOULD re-render
      expect(ProfiledConsumer).toHaveRenderedTimes(2);
    });

    it("should NOT re-render children that only consume RouterContext", async () => {
      await router.start("/users/list");

      // RouterContext only provides router instance which is stable
      const RouterConsumer: FC = memo(() => {
        const routerFromContext = useContext(RouterContext);

        return <div>{routerFromContext ? "Has Router" : "No Router"}</div>;
      });
      const ProfiledRouterConsumer = withProfiler(RouterConsumer);

      render(
        <RouterProvider router={router}>
          <ProfiledRouterConsumer />
        </RouterProvider>,
      );

      expect(ProfiledRouterConsumer).toHaveRenderedTimes(1);

      // Snapshot before navigation
      ProfiledRouterConsumer.snapshot();

      await act(async () => {
        await router.navigate("about");
      });

      // RouterContext value (router instance) is stable - memoized component should NOT re-render
      expect(ProfiledRouterConsumer).toNotHaveRerendered();
    });
  });

  describe("Context Values", () => {
    it("should provide stable router reference via RouterContext", async () => {
      await router.start("/users/list");

      let capturedRouter: Router | null = null;

      const RouterCapture: FC = () => {
        const routerFromContext = useContext(RouterContext);

        capturedRouter = routerFromContext;

        return null;
      };

      render(
        <RouterProvider router={router}>
          <RouterCapture />
        </RouterProvider>,
      );

      const initialRouter = capturedRouter;

      await act(async () => {
        await router.navigate("about");
      });

      // Router reference should be stable (same instance)
      expect(capturedRouter).toBe(initialRouter);
      expect(capturedRouter).toBe(router);
    });

    it("should update RouteContext on navigation", async () => {
      await router.start("/users/list");

      let currentRoute: string | undefined;
      let previousRoute: string | undefined;

      const RouteCapture: FC = () => {
        const context = useContext(RouteContext);

        currentRoute = context?.route?.name;
        previousRoute = context?.previousRoute?.name;

        return null;
      };

      render(
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>,
      );

      expect(currentRoute).toBe("users.list");
      expect(previousRoute).toBeUndefined();

      await act(async () => {
        await router.navigate("about");
      });

      expect(currentRoute).toBe("about");
      expect(previousRoute).toBe("users.list");
    });
  });

  describe("Multiple Navigations Performance", () => {
    it("should handle sequential navigations efficiently", async () => {
      await router.start("/");

      const ProfiledProvider = withProfiler(RouterProvider);

      render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);

      // 5 sequential navigations
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await router.navigate("users.view", { id: String(i) });
        });
      }

      // 1 mount + 5 updates = 6 total renders
      expect(ProfiledProvider).toMeetRenderCountBudget({
        maxRenders: 6,
        maxMounts: 1,
        maxUpdates: 5,
        componentName: "RouterProvider",
      });
      expect(ProfiledProvider).toHaveLastRenderedWithPhase("update");
    });

    it("should batch synchronous navigations", async () => {
      await router.start("/");

      const ProfiledProvider = withProfiler(RouterProvider);

      render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);

      // Multiple navigations in single act() - each await yields to React
      await act(async () => {
        await router.navigate("users.list");
        await router.navigate("about");
        await router.navigate("home");
      });

      // Each awaited navigate triggers a separate React update: 1 mount + 3 updates = 4
      expect(ProfiledProvider).toHaveRenderedTimes(4);
    });
  });

  describe("Store Stability (useMemo)", () => {
    it("should not recreate store on re-render with same router", async () => {
      await router.start("/users/list");

      const ProfiledProvider = withProfiler(RouterProvider);

      const { rerender } = render(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      expect(ProfiledProvider).toHaveRenderedTimes(1);

      // Force re-render with same router prop
      rerender(
        <ProfiledProvider router={router}>
          <div>Child</div>
        </ProfiledProvider>,
      );

      // Re-render happened but store should be stable (useMemo)
      expect(ProfiledProvider).toHaveRenderedTimes(2);

      // Navigate should still work (store subscription intact)
      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledProvider).toHaveRenderedTimes(3);
    });
  });

  describe("Nested Providers (Edge Case)", () => {
    it("should support nested RouterProviders with different routers", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      await router1.start("/users/list");
      await router2.start("/about");

      let innerRoute: string | undefined;
      let outerRoute: string | undefined;

      const InnerRouteCapture: FC = () => {
        const context = useContext(RouteContext);

        innerRoute = context?.route?.name;

        return <div data-testid="inner">{context?.route?.name}</div>;
      };

      const OuterRouteCapture: FC = () => {
        const context = useContext(RouteContext);

        outerRoute = context?.route?.name;

        return <div data-testid="outer">{context?.route?.name}</div>;
      };

      render(
        <RouterProvider router={router1}>
          <OuterRouteCapture />
          <RouterProvider router={router2}>
            <InnerRouteCapture />
          </RouterProvider>
        </RouterProvider>,
      );

      expect(outerRoute).toBe("users.list");
      expect(innerRoute).toBe("about");

      // Navigate outer router
      await act(async () => {
        await router1.navigate("home");
      });

      // Outer captures outer router's route
      expect(outerRoute).toBe("home");
      // Inner still captures inner router's route (unchanged)
      expect(innerRoute).toBe("about");

      // Navigate inner router
      await act(async () => {
        await router2.navigate("home");
      });

      // Outer unchanged
      expect(outerRoute).toBe("home");
      // Inner updated
      expect(innerRoute).toBe("home");

      router1.stop();
      router2.stop();
    });

    it("should provide correct context values to each level", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      await router1.start("/users/list");
      await router2.start("/about");

      let outerRouter: Router | null = null;
      let innerRouter: Router | null = null;

      const OuterRouterCapture: FC = () => {
        outerRouter = useContext(RouterContext);

        return null;
      };

      const InnerRouterCapture: FC = () => {
        innerRouter = useContext(RouterContext);

        return null;
      };

      render(
        <RouterProvider router={router1}>
          <OuterRouterCapture />
          <RouterProvider router={router2}>
            <InnerRouterCapture />
          </RouterProvider>
        </RouterProvider>,
      );

      expect(outerRouter).toBe(router1);
      expect(innerRouter).toBe(router2);
      // Verify different instances - both are non-null Router objects
      expect(outerRouter).not.toBeNull();
      expect(innerRouter).not.toBeNull();
      // Reference equality check - they should be different router instances
      expect(Object.is(outerRouter, innerRouter)).toBe(false);

      router1.stop();
      router2.stop();
    });
  });

  describe("Wrapper Pattern (Common Usage)", () => {
    it("should work correctly as wrapper for child components", async () => {
      await router.start("/users/list");

      const ChildComponent: FC<{ label: string }> = ({ label }) => {
        const context = useContext(RouteContext);

        return (
          <div>
            {label}: {context?.route?.name}
          </div>
        );
      };

      const ProfiledChild = withProfiler(ChildComponent);

      const wrapper = ({ children }: { children: ReactNode }) => (
        <RouterProvider router={router}>{children}</RouterProvider>
      );

      render(<ProfiledChild label="Route" />, { wrapper });

      expect(ProfiledChild).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("about");
      });

      expect(ProfiledChild).toHaveRenderedTimes(2);

      await act(async () => {
        await router.navigate("home");
      });

      expect(ProfiledChild).toHaveRenderedTimes(3);
    });
  });
});
