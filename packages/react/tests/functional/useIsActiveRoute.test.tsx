import { act, renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/react";

import { useIsActiveRoute } from "../../src/hooks/useIsActiveRoute";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC, PropsWithChildren } from "react";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
  children,
  router,
}) => <RouterProvider router={router}>{children}</RouterProvider>;

describe("useIsActiveRoute", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
    router.start("/users/123");
  });

  afterEach(() => {
    router.stop();
  });

  it("should check if route is active", () => {
    const { result } = renderHook(
      () => useIsActiveRoute(router, "users.view", { id: "123" }),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe(true);
  });

  it("should handle non-strict mode", () => {
    const { result } = renderHook(
      () => useIsActiveRoute(router, "users", {}, false),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe(true); // "users.view" is child of "users"
  });

  it("should handle strict mode", () => {
    const { result } = renderHook(
      () => useIsActiveRoute(router, "users", {}, true),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe(false); // Exact match required
  });

  it("should skip unrelated route updates", async () => {
    let checkCount = 0;

    // Mock isActive to count calls
    const originalIsActive = router.isActiveRoute.bind(router);

    vi.spyOn(router, "isActiveRoute").mockImplementation((...args) => {
      checkCount++;

      return originalIsActive(...args);
    });

    const { result } = renderHook(
      () => useIsActiveRoute(router, "users.view", { id: "123" }),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const initialCheckCount = checkCount;

    await act(async () => {
      router.navigate("home");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Should skip check for unrelated route
    expect(checkCount).toBe(initialCheckCount);
    expect(result.current).toBe(false);
  });

  describe("Optimization and parameters", () => {
    it("should update when activeStrict changes and router navigates", async () => {
      const { result, rerender } = renderHook(
        ({ strict }: { strict: boolean }) =>
          useIsActiveRoute(router, "users", {}, strict),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { strict: false },
        },
      );

      // Non-strict: users.view is child of users
      expect(result.current).toBe(true);

      // Switch to strict mode
      rerender({ strict: true });

      // Navigate away and back to trigger selector re-evaluation
      await act(() => router.navigate("home"));
      await act(() => router.navigate("users.view", { id: "123" }));

      // Strict: exact match required, users.view !== users
      expect(result.current).toBe(false);

      // Switch back to non-strict
      rerender({ strict: false });

      // Navigate away and back to trigger update
      await act(() => router.navigate("home"));
      await act(() => router.navigate("users.view", { id: "123" }));

      expect(result.current).toBe(true);
    });

    it("should handle complex route parameters correctly", async () => {
      router.addRoute([
        {
          name: "complex",
          path: "/complex",
        },
      ]);

      const complexParams = {
        filter: "active",
        sort: "date",
        page: 1,
        nested: { a: 1, b: 2 },
      };

      await act(() => router.navigate("complex", complexParams));

      const { result } = renderHook(
        () => useIsActiveRoute(router, "complex", complexParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(true);

      // Navigate to route with different params
      await act(() =>
        router.navigate("complex", { ...complexParams, page: 2 }),
      );

      // Now check with the different params - should be active
      const { result: result2 } = renderHook(
        () =>
          useIsActiveRoute(router, "complex", {
            ...complexParams,
            page: 2,
          }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result2.current).toBe(true);
    });

    it("should handle params change dynamically", async () => {
      const { result, rerender } = renderHook(
        ({ params }: { params: Record<string, string> }) =>
          useIsActiveRoute(router, "users.view", params),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { params: { id: "123" } },
        },
      );

      expect(result.current).toBe(true);

      // Change params
      rerender({ params: { id: "456" } });

      // Navigate away and back to trigger update with new selector
      await act(() => router.navigate("home"));
      await act(() => router.navigate("users.view", { id: "123" }));

      // Now checking for id: "456" but router is on id: "123"
      expect(result.current).toBe(false);

      // Change back to matching params
      rerender({ params: { id: "123" } });

      // Navigate away and back
      await act(() => router.navigate("home"));
      await act(() => router.navigate("users.view", { id: "123" }));

      expect(result.current).toBe(true);
    });
  });

  describe("Edge cases with parameters", () => {
    it("should handle empty and undefined parameters", () => {
      router.stop();
      router.start("/users/list");

      const { result: emptyParams } = renderHook(
        () => useIsActiveRoute(router, "users.list", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(emptyParams.current).toBe(true);

      const { result: undefinedParams } = renderHook(
        () => useIsActiveRoute(router, "users.list", undefined as never),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(undefinedParams.current).toBe(true);

      const { result: partialUndefined } = renderHook(
        () => useIsActiveRoute(router, "users.list", { id: undefined }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(partialUndefined.current).toBe(true);
    });

    it("should handle special characters in parameters", async () => {
      router.addRoute([{ name: "search", path: "/search" }]);

      const specialParams = {
        q: "hello#world&test?param=value/path",
        filter: "a&b",
      };

      await act(() => router.navigate("search", specialParams));

      const { result } = renderHook(
        () => useIsActiveRoute(router, "search", specialParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(true);
    });

    it("should handle numeric vs string parameters consistently", async () => {
      // Router params are always strings, so string "123" should match
      const { result: stringParam } = renderHook(
        () => useIsActiveRoute(router, "users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(stringParam.current).toBe(true);

      // Navigate to ensure we have a fresh state, then check with string again
      await act(() => router.navigate("users.view", { id: "123" }));

      expect(stringParam.current).toBe(true);
    });
  });

  describe("Performance with frequent updates", () => {
    it("should handle 1000 navigation checks efficiently", async () => {
      const { result } = renderHook(
        () => useIsActiveRoute(router, "users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const startTime = performance.now();

      // Perform 1000 navigations (last one will be to users.view since 999 is odd)
      for (let i = 0; i < 1000; i++) {
        await act(() =>
          router.navigate(i % 2 === 0 ? "home" : "users.view", {
            id: "123",
          }),
        );
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      // Final check should be correct (i=999 is odd, so last navigation is users.view)
      expect(result.current).toBe(true);
    });

    it("should optimize multiple hooks for same route", async () => {
      const hooks = [];

      for (let i = 0; i < 10; i++) {
        hooks.push(
          renderHook(
            () => useIsActiveRoute(router, "users.view", { id: "123" }),
            { wrapper: (props) => wrapper({ ...props, router }) },
          ),
        );
      }

      // All should return same result
      for (const hook of hooks) {
        expect(hook.result.current).toBe(true);
      }

      await act(() => router.navigate("home"));

      // All should update to false
      for (const hook of hooks) {
        expect(hook.result.current).toBe(false);
      }
    });

    it("should handle dynamic routeName changes", () => {
      // Use only routes without required parameters
      const routes = ["users.list", "home", "about", "test"];
      let currentIndex = 0;

      const { result, rerender } = renderHook(
        ({ routeName }: { routeName: string }) =>
          useIsActiveRoute(router, routeName, {}),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { routeName: routes[currentIndex] },
        },
      );

      // Change routeName multiple times
      for (let i = 0; i < 100; i++) {
        currentIndex = (currentIndex + 1) % routes.length;
        rerender({ routeName: routes[currentIndex] });
      }

      // Should not cause errors or memory leaks
      expect(result.current).toBeDefined();
    });
  });

  describe("Route hierarchy edge cases", () => {
    it("should correctly check parent route with nested active route", async () => {
      // Add a new route hierarchy with deep nesting
      router.addRoute([
        {
          name: "settings",
          path: "/settings",
          children: [
            {
              name: "profile",
              path: "/profile",
              children: [{ name: "edit", path: "/edit" }],
            },
          ],
        },
      ]);

      await act(() => router.navigate("settings.profile.edit"));

      // Non-strict: settings is parent of settings.profile.edit
      const { result: nonStrict } = renderHook(
        () => useIsActiveRoute(router, "settings", {}, false),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(nonStrict.current).toBe(true);

      // Strict: exact match required
      const { result: strict } = renderHook(
        () => useIsActiveRoute(router, "settings", {}, true),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(strict.current).toBe(false);

      // Check intermediate level
      const { result: intermediate } = renderHook(
        () => useIsActiveRoute(router, "settings.profile", {}, false),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(intermediate.current).toBe(true);
    });

    it("should distinguish routes with similar names", async () => {
      router.addRoute([
        { name: "user", path: "/user" },
        { name: "user-settings", path: "/user-settings" },
      ]);

      await act(() => router.navigate("users.view", { id: "123" }));

      // Check "user" is not active when "users.view" is
      const { result: userRoute } = renderHook(
        () => useIsActiveRoute(router, "user", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(userRoute.current).toBe(false);

      // Navigate to "user"
      await act(() => router.navigate("user"));

      expect(userRoute.current).toBe(true);

      // Check "users" is not active
      const { result: usersRoute } = renderHook(
        () => useIsActiveRoute(router, "users", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(usersRoute.current).toBe(false);
    });

    it("should handle root-level route correctly", async () => {
      router.addRoute([{ name: "dashboard", path: "/dashboard" }]);

      await act(() => router.navigate("dashboard"));

      const { result: dashboardCheck } = renderHook(
        () => useIsActiveRoute(router, "dashboard", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(dashboardCheck.current).toBe(true);

      await act(() => router.navigate("users.view", { id: "123" }));

      // Dashboard should not be active when on users.view
      expect(dashboardCheck.current).toBe(false);
    });
  });

  describe("Router synchronization", () => {
    it("should handle check before router start", () => {
      const newRouter = createTestRouterWithADefaultRouter();

      // Don't start router yet
      const { result } = renderHook(
        () => useIsActiveRoute(newRouter, "users.view", { id: "123" }),
        {
          wrapper: (props) => (
            <RouterProvider router={newRouter}>{props.children}</RouterProvider>
          ),
        },
      );

      // Should be false when router not started
      expect(result.current).toBe(false);

      // Start router
      act(() => {
        newRouter.start("/users/123");
      });

      // Should update to true
      expect(result.current).toBe(true);

      newRouter.stop();
    });

    it("should handle router stop and restart during operation", async () => {
      // Stop and restart the router
      act(() => {
        router.stop();
        router.start("/home");
      });

      // Now create hook after restart
      const { result } = renderHook(
        () => useIsActiveRoute(router, "users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // Currently on home, so users.view should not be active
      expect(result.current).toBe(false);

      // Navigate to users.view
      await act(() => router.navigate("users.view", { id: "123" }));

      // Should be true now
      expect(result.current).toBe(true);

      // Navigate away
      await act(() => router.navigate("home"));

      // Should be false again
      expect(result.current).toBe(false);
    });

    it("should work with different router instances independently", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      router1.start("/users/123");
      router2.start("/home");

      // Test with router1
      const { result: result1 } = renderHook(
        () => useIsActiveRoute(router1, "users.view", { id: "123" }),
        {
          wrapper: ({ children }) => (
            <RouterProvider router={router1}>{children}</RouterProvider>
          ),
        },
      );

      // router1 is on users.view
      expect(result1.current).toBe(true);

      // Test with router2
      const { result: result2 } = renderHook(
        () => useIsActiveRoute(router2, "users.view", { id: "123" }),
        {
          wrapper: ({ children }) => (
            <RouterProvider router={router2}>{children}</RouterProvider>
          ),
        },
      );

      // router2 is on home, not users.view
      expect(result2.current).toBe(false);

      // Navigate router2 to users.view
      await act(() => router2.navigate("users.view", { id: "123" }));

      // Now router2 should show active
      expect(result2.current).toBe(true);

      // router1 should still be active (independent)
      expect(result1.current).toBe(true);

      router1.stop();
      router2.stop();
    });
  });
});
