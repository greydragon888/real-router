import { render, screen } from "@solidjs/testing-library";
import { useContext } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  RouterProvider,
  useRouter,
  useRoute,
  RouterContext,
  RouteContext,
} from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

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

      function RouterCapture() {
        const ctx = useContext(RouterContext);

        capturedRouter = ctx?.router ?? null;

        return (
          <div data-testid="has-router">{capturedRouter ? "yes" : "no"}</div>
        );
      }

      render(() => (
        <RouterProvider router={router}>
          <RouterCapture />
        </RouterProvider>
      ));

      expect(capturedRouter).toBe(router);
      expect(screen.getByTestId("has-router")).toHaveTextContent("yes");
    });

    it("should provide route state via RouteContext", async () => {
      await router.start("/users/list");

      let capturedRoute: string | undefined;

      function RouteCapture() {
        const routeSignal = useContext(RouteContext);

        capturedRoute = routeSignal!().route?.name;

        return <div data-testid="route">{capturedRoute}</div>;
      }

      render(() => (
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>
      ));

      expect(capturedRoute).toBe("users.list");
      expect(screen.getByTestId("route")).toHaveTextContent("users.list");
    });

    it("should render children correctly", async () => {
      await router.start("/");

      render(() => (
        <RouterProvider router={router}>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </RouterProvider>
      ));

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });

    it("should throw error when RouterContext is accessed without provider", () => {
      function ComponentWithoutProvider() {
        useRouter();

        return <div>should not render</div>;
      }

      expect(() => {
        render(() => <ComponentWithoutProvider />);
      }).toThrow("useRouter must be used within a RouterProvider");
    });
  });

  describe("Navigation Updates", () => {
    it("should update RouteContext on navigation", async () => {
      await router.start("/users/list");

      function RouteDisplay() {
        const route = useRoute();

        return (
          <div>
            <span data-testid="current">{route().route?.name}</span>
            <span data-testid="previous">
              {route().previousRoute?.name ?? "none"}
            </span>
          </div>
        );
      }

      render(() => (
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>
      ));

      expect(screen.getByTestId("current")).toHaveTextContent("users.list");
      expect(screen.getByTestId("previous")).toHaveTextContent("none");

      await router.navigate("about");

      expect(screen.getByTestId("current")).toHaveTextContent("about");
      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");
    });

    it("should track previousRoute through multiple navigations", async () => {
      await router.start("/users/list");

      function RouteTracker() {
        const route = useRoute();

        return (
          <div data-testid="previous">
            {route().previousRoute?.name ?? "none"}
          </div>
        );
      }

      render(() => (
        <RouterProvider router={router}>
          <RouteTracker />
        </RouterProvider>
      ));

      expect(screen.getByTestId("previous")).toHaveTextContent("none");

      await router.navigate("about");

      expect(screen.getByTestId("previous")).toHaveTextContent("users.list");

      await router.navigate("home");

      expect(screen.getByTestId("previous")).toHaveTextContent("about");
    });
  });

  describe("Hook Integration", () => {
    it("should work with useRouter hook", async () => {
      await router.start("/users/list");

      function UseRouterComponent() {
        useRouter();

        return <div data-testid="router-exists">yes</div>;
      }

      render(() => (
        <RouterProvider router={router}>
          <UseRouterComponent />
        </RouterProvider>
      ));

      expect(screen.getByTestId("router-exists")).toHaveTextContent("yes");
    });

    it("should allow programmatic navigation via useRouter", async () => {
      await router.start("/users/list");

      function NavigationComponent() {
        const routerFromHook = useRouter();
        const route = useRoute();

        return (
          <div>
            <span data-testid="route">{route().route?.name}</span>
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
      }

      render(() => (
        <RouterProvider router={router}>
          <NavigationComponent />
        </RouterProvider>
      ));

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      screen.getByTestId("navigate-btn").click();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByTestId("route")).toHaveTextContent("about");
    });
  });

  describe("Edge Cases", () => {
    it("should handle router not started", () => {
      let route: string | undefined = "not-set";

      function RouteCapture() {
        const routeSignal = useContext(RouteContext);

        route = routeSignal!().route?.name;

        return <div data-testid="route">{route ?? "no-route"}</div>;
      }

      render(() => (
        <RouterProvider router={router}>
          <RouteCapture />
        </RouterProvider>
      ));

      expect(route).toBeUndefined();
      expect(screen.getByTestId("route")).toHaveTextContent("no-route");
    });

    it("should handle unmount correctly", async () => {
      await router.start("/users/list");

      function RouteDisplay() {
        const route = useRoute();

        return <div data-testid="route">{route().route?.name}</div>;
      }

      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <RouteDisplay />
        </RouterProvider>
      ));

      expect(screen.getByTestId("route")).toHaveTextContent("users.list");

      unmount();

      await router.navigate("about");

      expect(router.getState()?.name).toBe("about");
    });

    it("should support multiple consumers", async () => {
      await router.start("/users/list");

      function Consumer1() {
        const route = useRoute();

        return <div data-testid="consumer-1">{route().route?.name}</div>;
      }

      function Consumer2() {
        const route = useRoute();

        return <div data-testid="consumer-2">{route().route?.name}</div>;
      }

      render(() => (
        <RouterProvider router={router}>
          <Consumer1 />
          <Consumer2 />
        </RouterProvider>
      ));

      expect(screen.getByTestId("consumer-1")).toHaveTextContent("users.list");
      expect(screen.getByTestId("consumer-2")).toHaveTextContent("users.list");

      await router.navigate("about");

      expect(screen.getByTestId("consumer-1")).toHaveTextContent("about");
      expect(screen.getByTestId("consumer-2")).toHaveTextContent("about");
    });
  });
});
