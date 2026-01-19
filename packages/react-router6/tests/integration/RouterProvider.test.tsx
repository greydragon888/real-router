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
} from "react-router6";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { FC, ReactNode } from "react";
import type { Router } from "router6";

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
    it("should provide router instance via RouterContext", () => {
      router.start("/users/list");

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

    it("should provide route state via RouteContext", () => {
      router.start("/users/list");

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

    it("should render children correctly", () => {
      router.start("/");

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
    it("should provide router in RouteContext", () => {
      router.start("/users/list");

      let routerFromRouteContext: Router | undefined;

      const ContextCapture: FC = () => {
        const context = useContext(RouteContext);

        routerFromRouteContext = context?.router;

        return null;
      };

      render(
        <RouterProvider router={router}>
          <ContextCapture />
        </RouterProvider>,
      );

      expect(routerFromRouteContext).toBe(router);
    });

    it("should have undefined previousRoute on initial render", () => {
      router.start("/users/list");

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

    it("should include route params in route object", () => {
      router.start("/users/list");

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
      act(() => {
        router.navigate("users.view", { id: "123" });
      });

      expect(routeParams).toStrictEqual({ id: "123" });
      expect(screen.getByTestId("id")).toHaveTextContent("123");
    });
  });

  describe("Navigation Updates", () => {
    it("should update RouteContext on navigation", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
      });

      expect(screen.getByTestId("current")).toHaveTextContent("about");
      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");
    });

    it("should track previousRoute through multiple navigations", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");

      act(() => {
        router.navigate("home");
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("about");

      act(() => {
        router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("previous")).toHaveTextContent("home");
    });

    it("should update route params on navigation", async () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("users.view", { id: "1" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("1");
      });

      act(() => {
        router.navigate("users.view", { id: "42" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("42");
      });

      act(() => {
        router.navigate("users.view", { id: "999" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("id")).toHaveTextContent("999");
      });
    });
  });

  describe("Hook Integration", () => {
    it("should work with useRouter hook", () => {
      router.start("/users/list");

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

    it("should work with useRoute hook", () => {
      router.start("/users/list");

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
      router.start("/users/list");

      const NavigationComponent: FC = () => {
        const routerFromHook = useRouter();
        const { route } = useRoute();

        return (
          <div>
            <span data-testid="route">{route?.name}</span>
            <button
              data-testid="navigate-btn"
              onClick={() => {
                routerFromHook.navigate("about");
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
    it("should support nested RouterProviders with different routers", () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      router1.start("/users/list");
      router2.start("/about");

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
      act(() => {
        router1.navigate("home");
      });

      expect(screen.getByTestId("outer")).toHaveTextContent("home");
      expect(screen.getByTestId("inner")).toHaveTextContent("about");

      // Navigate inner router
      act(() => {
        router2.navigate("home");
      });

      expect(screen.getByTestId("outer")).toHaveTextContent("home");
      expect(screen.getByTestId("inner")).toHaveTextContent("home");

      router1.stop();
      router2.stop();
    });

    it("should isolate router instances in nested providers", () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      router1.start("/users/list");
      router2.start("/about");

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
      router.start("/users/list");

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
      act(() => {
        router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("about");
      });

      // Local state should be preserved
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    it("should support conditional rendering based on route", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
      });

      expect(screen.getByTestId("other-section")).toBeInTheDocument();
    });

    it("should support multiple consumers", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
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

    it("should handle router restart", () => {
      router.start("/users/list");

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
      act(() => {
        router.stop();
        router.start("/about");
      });

      // After restart, component should still work
      expect(screen.getByTestId("route")).toHaveTextContent("about");
    });

    it("should handle rapid navigation", async () => {
      router.start("/");

      render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      // Rapid sequential navigations
      act(() => {
        router.navigate("users.list");
      });

      act(() => {
        router.navigate("about");
      });

      act(() => {
        router.navigate("home");
      });

      act(() => {
        router.navigate("users.view", { id: "42" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("route")).toHaveTextContent("users.view");
      });
    });

    it("should handle unmount correctly", () => {
      router.start("/users/list");

      const { unmount } = render(
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>,
      );

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      // Unmount
      unmount();

      // Navigation after unmount should not cause errors
      act(() => {
        router.navigate("about");
      });

      expect(router.getState()?.name).toBe("about");
    });

    it("should handle effect cleanup during navigation", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
      });

      expect(cleanupCalls).toContain("users.list");

      act(() => {
        router.navigate("home");
      });

      expect(cleanupCalls).toContain("about");
    });
  });

  describe("Store Behavior", () => {
    it("should maintain stable router reference across navigations", () => {
      router.start("/users/list");

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

      act(() => {
        router.navigate("about");
      });

      act(() => {
        router.navigate("home");
      });

      // All captured router references should be the same instance
      // 3 renders: initial + 2 navigations
      expect(routerReferences.length).toBeGreaterThan(1);

      routerReferences.forEach((r) => {
        expect(r).toBe(router);
      });
    });

    it("should create new store when router prop changes", () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      router1.start("/users/list");
      router2.start("/about");

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
