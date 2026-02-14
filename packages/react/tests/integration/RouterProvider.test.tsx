import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { useContext, useState, useEffect } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  RouterProvider,
  RouterContext,
  RouteContext,
  useRouter,
  useRoute,
} from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

// Shared test component
const RouteDisplay: FC = () => {
  const { route } = useRoute();

  return <div data-testid="route">{route?.name}</div>;
};

describe("RouterProvider - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Basic Integration", () => {
    it("should provide router instance via RouterContext", async () => {
      await router.start("/users/list");

      let capturedRouter: Router | null = null;

      const RouterCapture: FC = () => {
        capturedRouter = useContext(RouterContext);

        return (
          <div data-testid="has-router">{capturedRouter ? "yes" : "no"}</div>
        );
      };

      render(
        <RouterProvider router={router}>
          <RouterCapture />
        </RouterProvider>,
      );

      expect(capturedRouter).toBe(router);
      expect(screen.getByTestId("has-router")).toHaveTextContent("yes");
    });

    it("should provide route state via RouteContext", async () => {
      await router.start("/users/list");

      let capturedRoute: string | undefined;
      let capturedPreviousRoute: string | undefined;

      const RouteCapture: FC = () => {
        const context = useContext(RouteContext);

        capturedRoute = context?.route?.name;
        capturedPreviousRoute = context?.previousRoute?.name;

        return <div data-testid="route">{capturedRoute}</div>;
      };

      render(
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>,
      );

      expect(capturedRoute).toBe("users.list");
      expect(capturedPreviousRoute).toBeUndefined();
      expect(screen.getByTestId("route")).toHaveTextContent("users.list");
    });

    it("should render children correctly", async () => {
      await router.start("/");

      render(
        <RouterProvider router={router}>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </RouterProvider>,
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });

    it("should throw error when RouterContext is accessed without provider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const ComponentWithoutProvider: FC = () => {
        useRouter();

        return <div>should not render</div>;
      };

      expect(() => {
        render(<ComponentWithoutProvider />);
      }).toThrowError("useRouter must be used within a RouterProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("Context Values", () => {
    it("should provide navigator in RouteContext", async () => {
      await router.start("/users/list");

      let navigatorFromRouteContext: any;

      const ContextCapture: FC = () => {
        const context = useContext(RouteContext);

        navigatorFromRouteContext = context?.navigator;

        return null;
      };

      render(
        <RouterProvider router={router}>
          <ContextCapture />
        </RouterProvider>,
      );

      expect(navigatorFromRouteContext).toBeDefined();
      expect(navigatorFromRouteContext.navigate).toBeDefined();
      expect(navigatorFromRouteContext.getState).toBeDefined();
      expect(navigatorFromRouteContext.isActiveRoute).toBeDefined();
      expect(navigatorFromRouteContext.subscribe).toBeDefined();
    });

    it("should have undefined previousRoute on initial render", async () => {
      await router.start("/users/list");

      let previousRoute: string | undefined = "not-set";

      const RouteCapture: FC = () => {
        const context = useContext(RouteContext);

        previousRoute = context?.previousRoute?.name;

        return null;
      };

      render(
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>,
      );

      expect(previousRoute).toBeUndefined();
    });

    it("should include route params in route object", async () => {
      await router.start("/users/list");

      let routeParams: Record<string, string> | undefined;

      const ParamsCapture: FC = () => {
        const context = useContext(RouteContext);

        routeParams = context?.route?.params as
          | Record<string, string>
          | undefined;

        return <div data-testid="id">{routeParams?.id ?? "no-id"}</div>;
      };

      render(
        <RouterProvider router={router}>
          <ParamsCapture />
        </RouterProvider>,
      );

      // Navigate to route with params
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(routeParams).toStrictEqual({ id: "123" });
      expect(screen.getByTestId("id")).toHaveTextContent("123");
    });
  });

  describe("Navigation Updates", () => {
    it("should update RouteContext on navigation", async () => {
      await router.start("/users/list");

      const RouteDisplay: FC = () => {
        const context = useContext(RouteContext);

        return (
          <div>
            <span data-testid="current">{context?.route?.name}</span>
            <span data-testid="previous">
              {context?.previousRoute?.name ?? "none"}
            </span>
          </div>
        );
      };

      render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      expect(screen.getByTestId("current")).toHaveTextContent("users.list");
      expect(screen.getByTestId("previous")).toHaveTextContent("none");

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("current")).toHaveTextContent("about");
      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");
    });

    it("should track previousRoute through multiple navigations", async () => {
      await router.start("/users/list");

      const RouteTracker: FC = () => {
        const context = useContext(RouteContext);

        return (
          <div data-testid="previous">
            {context?.previousRoute?.name ?? "none"}
          </div>
        );
      };

      render(
        <RouterProvider router={router}>
          <RouteTracker />
        </RouterProvider>,
      );

      expect(screen.getByTestId("previous")).toHaveTextContent("none");

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");

      await act(async () => {
        await router.navigate("home");
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("about");

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("home");
    });

    it("should update route params on navigation", async () => {
      await router.start("/users/list");

      const ParamsDisplay: FC = () => {
        const context = useContext(RouteContext);
        const params = context?.route?.params as
          | Record<string, string>
          | undefined;

        return <div data-testid="id">{params?.id ?? "no-id"}</div>;
      };

      render(
        <RouterProvider router={router}>
          <ParamsDisplay />
        </RouterProvider>,
      );

      expect(screen.getByTestId("id")).toHaveTextContent("no-id");

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("1");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "42" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("42");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "999" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("999");
      });
    });
  });

  describe("Hook Integration", () => {
    it("should work with useRouter hook", async () => {
      await router.start("/users/list");

      const UseRouterComponent: FC = () => {
        useRouter();

        return <div data-testid="router-exists">yes</div>;
      };

      render(
        <RouterProvider router={router}>
          <UseRouterComponent />
        </RouterProvider>,
      );

      expect(screen.getByTestId("router-exists")).toHaveTextContent("yes");
    });

    it("should work with useRoute hook", async () => {
      await router.start("/users/list");

      const UseRouteComponent: FC = () => {
        const { route, previousRoute } = useRoute();

        return (
          <div>
            <span data-testid="route">{route?.name}</span>
            <span data-testid="previous">{previousRoute?.name ?? "none"}</span>
            <span data-testid="has-router">yes</span>
          </div>
        );
      };

      render(
        <RouterProvider router={router}>
          <UseRouteComponent />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");
      expect(screen.getByTestId("previous")).toHaveTextContent("none");
      expect(screen.getByTestId("has-router")).toHaveTextContent("yes");
    });

    it("should allow programmatic navigation via useRouter", async () => {
      await router.start("/users/list");

      const NavigationComponent: FC = () => {
        const routerFromHook = useRouter();
        const { route } = useRoute();

        return (
          <div>
            <span data-testid="route">{route?.name}</span>
            <button
              data-testid="navigate-btn"
              onClick={() => {
                void routerFromHook.navigate("about");
              }}
            >
              Go to About
            </button>
          </div>
        );
      };

      render(
        <RouterProvider router={router}>
          <NavigationComponent />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      fireEvent.click(screen.getByTestId("navigate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("about");
      });
    });
  });

  describe("Nested Providers", () => {
    it("should support nested RouterProviders with different routers", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      await router1.start("/users/list");
      await router2.start("/about");

      const OuterRouteDisplay: FC = () => {
        const context = useContext(RouteContext);

        return <div data-testid="outer">{context?.route?.name}</div>;
      };

      const InnerRouteDisplay: FC = () => {
        const context = useContext(RouteContext);

        return <div data-testid="inner">{context?.route?.name}</div>;
      };

      render(
        <RouterProvider router={router1}>
          <OuterRouteDisplay />
          <RouterProvider router={router2}>
            <InnerRouteDisplay />
          </RouterProvider>
        </RouterProvider>,
      );

      expect(screen.getByTestId("outer")).toHaveTextContent("users.list");
      expect(screen.getByTestId("inner")).toHaveTextContent("about");

      // Navigate outer router
      await act(async () => {
        await router1.navigate("home");
      });

      expect(screen.getByTestId("outer")).toHaveTextContent("home");
      expect(screen.getByTestId("inner")).toHaveTextContent("about");

      // Navigate inner router
      await act(async () => {
        await router2.navigate("home");
      });

      expect(screen.getByTestId("outer")).toHaveTextContent("home");
      expect(screen.getByTestId("inner")).toHaveTextContent("home");

      router1.stop();
      router2.stop();
    });

    it("should isolate router instances in nested providers", async () => {
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

  describe("Component Integration", () => {
    it("should work with component local state", async () => {
      await router.start("/users/list");

      const StatefulComponent: FC = () => {
        const { route } = useRoute();
        const [count, setCount] = useState(0);

        return (
          <div>
            <span data-testid="route">{route?.name}</span>
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

      render(
        <RouterProvider router={router}>
          <StatefulComponent />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");
      expect(screen.getByTestId("count")).toHaveTextContent("0");

      // Increment local state
      fireEvent.click(screen.getByTestId("increment"));

      expect(screen.getByTestId("count")).toHaveTextContent("1");

      // Navigate
      await act(async () => {
        await router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("about");
      });

      // Local state should be preserved
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    it("should support conditional rendering based on route", async () => {
      await router.start("/users/list");

      const ConditionalComponent: FC = () => {
        const { route } = useRoute();

        if (route?.name.startsWith("users")) {
          return <div data-testid="users-section">Users Section</div>;
        }

        return <div data-testid="other-section">Other Section</div>;
      };

      render(
        <RouterProvider router={router}>
          <ConditionalComponent />
        </RouterProvider>,
      );

      expect(screen.getByTestId("users-section")).toBeInTheDocument();

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("other-section")).toBeInTheDocument();
    });

    it("should support multiple consumers", async () => {
      await router.start("/users/list");

      const Consumer1: FC = () => {
        const { route } = useRoute();

        return <div data-testid="consumer-1">{route?.name}</div>;
      };

      const Consumer2: FC = () => {
        const context = useContext(RouteContext);

        return <div data-testid="consumer-2">{context?.route?.name}</div>;
      };

      const Consumer3: FC = () => {
        const { route } = useRoute();

        return <div data-testid="consumer-3">{route?.name}</div>;
      };

      render(
        <RouterProvider router={router}>
          <Consumer1 />
          <Consumer2 />
          <Consumer3 />
        </RouterProvider>,
      );

      expect(screen.getByTestId("consumer-1")).toHaveTextContent("users.list");
      expect(screen.getByTestId("consumer-2")).toHaveTextContent("users.list");
      expect(screen.getByTestId("consumer-3")).toHaveTextContent("users.list");

      await act(async () => {
        await router.navigate("about");
      });

      expect(screen.getByTestId("consumer-1")).toHaveTextContent("about");
      expect(screen.getByTestId("consumer-2")).toHaveTextContent("about");
      expect(screen.getByTestId("consumer-3")).toHaveTextContent("about");
    });
  });

  describe("Edge Cases", () => {
    it("should handle router not started", () => {
      // Router not started - getState() returns null
      let route: string | undefined = "not-set";

      const RouteCapture: FC = () => {
        const context = useContext(RouteContext);

        route = context?.route?.name;

        return <div data-testid="route">{route ?? "no-route"}</div>;
      };

      render(
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>,
      );

      expect(route).toBeUndefined();
      expect(screen.getByTestId("route")).toHaveTextContent("no-route");
    });

    it("should handle router restart", async () => {
      await router.start("/users/list");

      const RouteDisplay: FC = () => {
        const { route } = useRoute();

        return <div data-testid="route">{route?.name ?? "no-route"}</div>;
      };

      render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      // Stop and restart router
      await act(async () => {
        router.stop();
        await router.start("/about");
      });

      // After restart, component should still work
      expect(screen.getByTestId("route")).toHaveTextContent("about");
    });

    it("should handle rapid navigation", async () => {
      await router.start("/");

      render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      // Rapid sequential navigations
      await act(async () => {
        await router.navigate("users.list");
      });

      await act(async () => {
        await router.navigate("about");
      });

      await act(async () => {
        await router.navigate("home");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "42" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("users.view");
      });
    });

    it("should handle unmount correctly", async () => {
      await router.start("/users/list");

      const { unmount } = render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      // Unmount
      unmount();

      // Navigation after unmount should not cause errors
      await act(async () => {
        await router.navigate("about");
      });

      expect(router.getState()?.name).toBe("about");
    });

    it("should handle effect cleanup during navigation", async () => {
      await router.start("/users/list");

      const cleanupCalls: string[] = [];

      const EffectComponent: FC = () => {
        const { route } = useRoute();

        useEffect(() => {
          return () => {
            cleanupCalls.push(route?.name ?? "unknown");
          };
        }, [route?.name]);

        return <div data-testid="route">{route?.name}</div>;
      };

      render(
        <RouterProvider router={router}>
          <EffectComponent />
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("about");
      });

      expect(cleanupCalls).toContain("users.list");

      await act(async () => {
        await router.navigate("home");
      });

      expect(cleanupCalls).toContain("about");
    });
  });

  describe("Store Behavior", () => {
    it("should maintain stable router reference across navigations", async () => {
      await router.start("/users/list");

      const routerReferences: Router[] = [];

      // Component must use RouteContext to trigger re-renders on navigation
      // RouterContext alone doesn't change on navigation
      const RouterCapture: FC = () => {
        const routerFromContext = useContext(RouterContext);
        // Subscribe to route changes to trigger re-renders
        const routeContext = useContext(RouteContext);

        // Only capture when we have both contexts
        if (routerFromContext && routeContext) {
          routerReferences.push(routerFromContext);
        }

        return null;
      };

      render(
        <RouterProvider router={router}>
          <RouterCapture />
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("about");
      });

      await act(async () => {
        await router.navigate("home");
      });

      // All captured router references should be the same instance
      // 3 renders: initial + 2 navigations
      expect(routerReferences.length).toBeGreaterThan(1);

      routerReferences.forEach((r) => {
        expect(r).toBe(router);
      });
    });

    it("should create new store when router prop changes", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      await router1.start("/users/list");
      await router2.start("/about");

      const Wrapper: FC<{ routerInstance: Router; children: ReactNode }> = ({
        routerInstance,
        children,
      }) => <RouterProvider router={routerInstance}>{children}</RouterProvider>;

      const { rerender } = render(
        <Wrapper routerInstance={router1}>
          <RouteDisplay />
        </Wrapper>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      // Change router prop
      rerender(
        <Wrapper routerInstance={router2}>
          <RouteDisplay />
        </Wrapper>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("about");

      router1.stop();
      router2.stop();
    });
  });
});
