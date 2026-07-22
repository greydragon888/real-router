import { errorCodes } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { createActiveRouteSource } from "@real-router/sources";
import { act, renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

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

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/users/123");
  });

  afterEach(() => {
    router.stop();
  });

  it("should check if route is active", () => {
    const { result } = renderHook(
      () => useIsActiveRoute("users.view", { id: "123" }),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe(true);
  });

  it("a default useIsActiveRoute uses the shared name-selector fast path, NOT a per-instance createActiveRouteSource (#1248)", () => {
    // #1248 — a default-options call (no params, non-strict, ignoreQueryParams,
    // no hash) resolves active state through the per-router
    // `createActiveNameSelector` (ONE shared `router.subscribe` for any number
    // of distinct-name links) instead of a per-instance `createActiveRouteSource`
    // (a BaseSource + its own router subscription EACH). Direct port of svelte
    // (#1101) / angular (#1104).
    //
    // Discriminator: the canonical undefined-params slow-path source is
    // therefore still UNBUILT after the hook mounts. Building it now is a cache
    // MISS — `buildActiveRouteSource` computes its initial value via
    // `router.isActiveRoute`. (Pre-#1248 the hook built this exact source, so the
    // same call was a cache HIT and `isActiveRoute` was NOT re-run.)
    renderHook(() => useIsActiveRoute("users"), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "users", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(isActiveRouteSpy).toHaveBeenCalled();
  });

  it("an empty routeName is inactive — agrees with router.isActiveRoute('') (#1427)", () => {
    // #1427 — an empty `routeName` is a misuse (matches no route). The canonical
    // answer is `router.isActiveRoute("") === false`, and the hook must agree.
    // The default-options fast-path predicate lacked the `routeName !== ""` guard,
    // so "" took the name-selector fast path where `selector.isActive("") === true`
    // (the root is every route's ancestor) and the hook wrongly reported active.
    // The shared `createActiveSource` builder carries the guard, routing "" to the
    // slow path whose snapshot is `router.isActiveRoute("")`.
    expect(router.isActiveRoute("")).toBe(false);

    const { result } = renderHook(() => useIsActiveRoute(""), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current).toBe(false);
  });

  it("should handle non-strict mode", () => {
    const { result } = renderHook(
      () => useIsActiveRoute("users", {}, undefined, false),
      {
        wrapper: (props) => wrapper({ ...props, router }),
      },
    );

    expect(result.current).toBe(true); // "users.view" is child of "users"
  });

  it("should handle strict mode", () => {
    const { result } = renderHook(
      () => useIsActiveRoute("users", {}, undefined, true),
      {
        wrapper: (props) => wrapper({ ...props, router }),
      },
    );

    expect(result.current).toBe(false); // Exact match required
  });

  it("should skip unrelated route updates", async () => {
    // Call-count coupling here is intentional: isActiveRoute NOT being called
    // for unrelated route changes IS the optimization invariant under test.
    const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

    const { result } = renderHook(
      () => useIsActiveRoute("users.view", { id: "123" }),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const callsBefore = isActiveRouteSpy.mock.calls.length;

    await act(async () => {
      await router.navigate("home");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // No additional isActiveRoute calls after navigating to an unrelated route.
    expect(isActiveRouteSpy).toHaveBeenCalledTimes(callsBefore);
    expect(result.current).toBe(false);
  });

  describe("Optimization and parameters", () => {
    it("should update when activeStrict changes and router navigates", async () => {
      const { result, rerender } = renderHook(
        ({ strict }: { strict: boolean }) =>
          useIsActiveRoute("users", {}, undefined, strict),
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
      getRoutesApi(router).add([
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
        () => useIsActiveRoute("complex", complexParams),
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
          useIsActiveRoute("complex", {
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
          useIsActiveRoute("users.view", params),
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
    it("should handle empty and undefined parameters", async () => {
      router.stop();
      await router.start("/users/list");

      const { result: emptyParams } = renderHook(
        () => useIsActiveRoute("users.list", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(emptyParams.current).toBe(true);

      const { result: undefinedParams } = renderHook(
        () => useIsActiveRoute("users.list", undefined as never),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(undefinedParams.current).toBe(true);

      const { result: partialUndefined } = renderHook(
        () => useIsActiveRoute("users.list", { id: undefined }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(partialUndefined.current).toBe(true);
    });

    it("should handle special characters in parameters", async () => {
      getRoutesApi(router).add([{ name: "search", path: "/search" }]);

      const specialParams = {
        q: "hello#world&test?param=value/path",
        filter: "a&b",
      };

      await act(() => router.navigate("search", specialParams));

      const { result } = renderHook(
        () => useIsActiveRoute("search", specialParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(true);
    });

    it("should handle numeric vs string parameters consistently", async () => {
      // Router params are always strings, so string "123" should match
      const { result: stringParam } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(stringParam.current).toBe(true);

      // Navigate to ensure we have a fresh state, then check with string again
      await act(async () => {
        await expect(
          router.navigate("users.view", { id: "123" }),
        ).rejects.toMatchObject({ code: errorCodes.SAME_STATES });
      });

      expect(stringParam.current).toBe(true);
    });
  });

  describe("Performance with frequent updates", () => {
    it("should handle 1000 navigation checks efficiently", async () => {
      const { result } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // Sample at start, two intermediate points, and the end so a mid-loop
      // flip-flop in the active source can't slip through with only the final
      // assertion catching it.
      const intermediateCheckpoints = [0, 250, 500, 750];
      // For each checkpoint i, after navigate(i % 2 === 0 ? "home" : "users.view"),
      // the hook value should be (i % 2 === 1).
      const observedSamples: { index: number; active: boolean }[] = [];

      // Perform 1000 navigations (last one will be to users.view since 999 is odd)
      for (let i = 0; i < 1000; i++) {
        await act(() =>
          router.navigate(i % 2 === 0 ? "home" : "users.view", {
            id: "123",
          }),
        );

        if (intermediateCheckpoints.includes(i)) {
          observedSamples.push({ index: i, active: result.current });
        }
      }

      expect(observedSamples).toStrictEqual(
        intermediateCheckpoints.map((index) => ({
          index,
          active: index % 2 === 1,
        })),
      );

      // Final check should be correct (i=999 is odd, so last navigation is users.view)
      expect(result.current).toBe(true);
    });

    it("should optimize multiple hooks for same route", async () => {
      const hooks = [];

      for (let i = 0; i < 10; i++) {
        hooks.push(
          renderHook(() => useIsActiveRoute("users.view", { id: "123" }), {
            wrapper: (props) => wrapper({ ...props, router }),
          }),
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
          useIsActiveRoute(routeName, {}),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { routeName: routes[currentIndex] },
        },
      );

      // Sample mid-loop so a regression that returns a non-boolean (NaN,
      // undefined, null) at any intermediate iteration doesn't silently pass.
      const intermediateCheckpoints = [0, 25, 50, 75];
      const observedTypes: { index: number; type: string }[] = [];

      for (let i = 0; i < 100; i++) {
        currentIndex = (currentIndex + 1) % routes.length;
        rerender({ routeName: routes[currentIndex] });

        if (intermediateCheckpoints.includes(i)) {
          observedTypes.push({ index: i, type: typeof result.current });
        }
      }

      expect(observedTypes).toStrictEqual(
        intermediateCheckpoints.map((index) => ({ index, type: "boolean" })),
      );

      // Anchor on a known-inactive name to verify no memory corruption:
      // the hook must still return false (boolean) for a non-matching route.
      rerender({ routeName: "definitely-nonexistent-route" });

      expect(result.current).toBe(false);
    });
  });

  describe("useStableValue fallback: non-serializable params", () => {
    it("should not throw when params contain non-serializable values (identity fallback)", async () => {
      const circular: Record<string, unknown> = {};

      circular.self = circular;

      // Circular reference: JSON.stringify throws → useStableValue falls back
      // to identity comparison. Hook must still produce a boolean without crashing.
      const { result } = renderHook(
        () =>
          useIsActiveRoute(
            "users.view",
            circular as unknown as Record<string, string>,
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // Route name matches (users.view active) but params differ (circular ≠ {id:"123"}) → false.
      expect(result.current).toBe(false);
    });

    it("should keep stable reference across re-renders when same non-serializable value is passed", () => {
      const bigintParams = { id: 1n } as unknown as Record<string, string>;

      const { result, rerender } = renderHook(
        () => useIsActiveRoute("users.view", bigintParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const first = result.current;

      rerender();
      rerender();

      // Same identity — stableRef.current reused via Object.is fallback.
      expect(result.current).toBe(first);
    });

    it("should update stableRef when non-serializable value changes identity", () => {
      let params: Record<string, unknown> = { id: 1n };

      const { result, rerender } = renderHook(
        () => useIsActiveRoute("users.view", params as Record<string, string>),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // First render: route name matches but 1n ≠ "123" (string) → false.
      expect(result.current).toBe(false);

      // New object, still non-serializable → catch branch must update stableRef.current.
      params = { id: 2n };
      rerender();

      // 2n ≠ "123" → still false; stableRef updated to new object identity.
      expect(result.current).toBe(false);
    });
  });

  describe("Route hierarchy edge cases", () => {
    it("should correctly check parent route with nested active route", async () => {
      // Add a new route hierarchy with deep nesting
      getRoutesApi(router).add([
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
        () => useIsActiveRoute("settings", {}, undefined, false),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(nonStrict.current).toBe(true);

      // Strict: exact match required
      const { result: strict } = renderHook(
        () => useIsActiveRoute("settings", {}, undefined, true),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(strict.current).toBe(false);

      // Check intermediate level
      const { result: intermediate } = renderHook(
        () => useIsActiveRoute("settings.profile", {}, undefined, false),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(intermediate.current).toBe(true);
    });

    it("should distinguish routes with similar names", async () => {
      getRoutesApi(router).add([
        { name: "user", path: "/user" },
        { name: "user-settings", path: "/user-settings" },
      ]);

      await act(async () => {
        await expect(
          router.navigate("users.view", { id: "123" }),
        ).rejects.toMatchObject({ code: errorCodes.SAME_STATES });
      });

      // Check "user" is not active when "users.view" is
      const { result: userRoute } = renderHook(
        () => useIsActiveRoute("user", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(userRoute.current).toBe(false);

      // Navigate to "user"
      await act(() => router.navigate("user"));

      expect(userRoute.current).toBe(true);

      // Check "users" is not active
      const { result: usersRoute } = renderHook(
        () => useIsActiveRoute("users", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(usersRoute.current).toBe(false);
    });

    it("should handle root-level route correctly", async () => {
      getRoutesApi(router).add([{ name: "dashboard", path: "/dashboard" }]);

      await act(() => router.navigate("dashboard"));

      const { result: dashboardCheck } = renderHook(
        () => useIsActiveRoute("dashboard", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(dashboardCheck.current).toBe(true);

      await act(() => router.navigate("users.view", { id: "123" }));

      // Dashboard should not be active when on users.view
      expect(dashboardCheck.current).toBe(false);
    });
  });

  describe("Router synchronization", () => {
    it("should handle check before router start", async () => {
      const newRouter = createTestRouterWithADefaultRouter();

      // Don't start router yet
      const { result } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        {
          wrapper: (props) => (
            <RouterProvider router={newRouter}>{props.children}</RouterProvider>
          ),
        },
      );

      // Should be false when router not started
      expect(result.current).toBe(false);

      // Start router
      await act(() => newRouter.start("/users/123"));

      // Should update to true
      expect(result.current).toBe(true);

      newRouter.stop();
    });

    it("should handle router stop and restart during operation", async () => {
      // Stop and restart the router
      await act(async () => {
        router.stop();
        await router.start("/home");
      });

      // Now create hook after restart
      const { result } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
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

      await router1.start("/users/123");
      await router2.start("/home");

      // Test with router1
      const { result: result1 } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
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
        () => useIsActiveRoute("users.view", { id: "123" }),
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
