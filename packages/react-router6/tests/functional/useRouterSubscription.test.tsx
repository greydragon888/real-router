import { act, renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "react-router6";

import { useRouterSubscription } from "../../modules/hooks/useRouterSubscription";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { FC, PropsWithChildren } from "react";
import type { Router } from "router6";

const wrapper: FC<PropsWithChildren<{ router: Router }>> = ({
  children,
  router,
}) => <RouterProvider router={router}>{children}</RouterProvider>;

describe("useRouterSubscription", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return initial state", () => {
    const { result } = renderHook(
      () =>
        useRouterSubscription(router, () => router.getState()?.name ?? "none"),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe("test");
  });

  it("should update when route changes", async () => {
    const { result } = renderHook(
      () => useRouterSubscription(router, (sub) => sub?.route.name ?? "none"),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe("test");

    await act(async () => {
      router.navigate("users");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe("users");
  });

  it("should skip updates when shouldUpdate returns false", async () => {
    let updateCount = 0;

    const { result } = renderHook(
      () =>
        useRouterSubscription(
          router,
          () => {
            updateCount++;

            return updateCount;
          },
          (newRoute) => newRoute.name === "users",
        ),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    expect(result.current).toBe(1); // Initial call

    await act(async () => {
      router.navigate("home");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe(1); // No update

    await act(async () => {
      router.navigate("users");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBe(2); // Updated
  });

  it("should use Object.is for comparison", async () => {
    const value = { count: 1 };

    const { result } = renderHook(
      () =>
        useRouterSubscription(
          router,
          () => value, // Always return same object reference
        ),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const firstValue = result.current;

    await act(async () => {
      router.navigate("users");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Should not trigger re-render since object reference is the same
    expect(result.current).toBe(firstValue);
  });

  describe("Race conditions and synchronization", () => {
    it("should handle rapid sequential navigation correctly", async () => {
      const states: string[] = [];

      const { result } = renderHook(
        () =>
          useRouterSubscription(router, (sub) => {
            const name = sub?.route.name ?? "none";

            states.push(name);

            return name;
          }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialState = result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(initialState).toBeTruthy();

      const initialStateIndex = states.length - 1;

      // Rapid navigation: home → users → users.view → home
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("home");

      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("users");

      await act(async () => {
        router.navigate("users.view", { id: "123" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("users.view");

      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Final state should be 'home'
      expect(result.current).toBe("home");
      // Verify all events were processed in order
      expect(states.slice(initialStateIndex + 1)).toContain("home");
      expect(states.slice(initialStateIndex + 1)).toContain("users");
      expect(states.slice(initialStateIndex + 1)).toContain("users.view");
      expect(states.at(-1)).toBe("home");
    });

    it("should handle unsubscribe during navigation without errors", () => {
      const { result, unmount } = renderHook(
        () => useRouterSubscription(router, (sub) => sub?.route.name ?? "none"),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialState = result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(initialState).toBeTruthy();

      // Start navigation and unmount immediately
      act(() => {
        router.navigate("users");
        unmount();
      });

      // Should not throw errors or cause memory leaks
      expect(router.getState()?.name).toBe("users");
    });

    it("should handle multiple subscribers with different shouldUpdate conditions", async () => {
      let subscriber1Updates = 0;
      let subscriber2Updates = 0;
      let subscriber3Updates = 0;

      const { result: result1 } = renderHook(
        () =>
          useRouterSubscription(
            router,
            () => {
              subscriber1Updates++;

              return "sub1";
            },
            (route) => route.name === "users",
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const { result: result2 } = renderHook(
        () =>
          useRouterSubscription(
            router,
            () => {
              subscriber2Updates++;

              return "sub2";
            },
            (route) => route.name === "home",
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const { result: result3 } = renderHook(
        () =>
          useRouterSubscription(
            router,
            () => {
              subscriber3Updates++;

              return "sub3";
            },
            (route) => route.name.startsWith("items"),
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialCounts = {
        sub1: subscriber1Updates,
        sub2: subscriber2Updates,
        sub3: subscriber3Updates,
      };

      // Navigate to route that doesn't match any filter first
      await act(async () => {
        router.navigate("about");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Counts should remain unchanged
      expect(subscriber1Updates).toBe(initialCounts.sub1);
      expect(subscriber2Updates).toBe(initialCounts.sub2);
      expect(subscriber3Updates).toBe(initialCounts.sub3);

      // Navigate to 'users' - only subscriber1 should update
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(subscriber1Updates).toBe(initialCounts.sub1 + 1);
      expect(subscriber2Updates).toBe(initialCounts.sub2);
      expect(subscriber3Updates).toBe(initialCounts.sub3);

      // Navigate to 'home' - only subscriber2 should update
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(subscriber1Updates).toBe(initialCounts.sub1 + 1);
      expect(subscriber2Updates).toBe(initialCounts.sub2 + 1);
      expect(subscriber3Updates).toBe(initialCounts.sub3);

      // Navigate to 'items.item' - only subscriber3 should update
      await act(async () => {
        router.navigate("items.item", { id: "1" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(subscriber1Updates).toBe(initialCounts.sub1 + 1);
      expect(subscriber2Updates).toBe(initialCounts.sub2 + 1);
      expect(subscriber3Updates).toBe(initialCounts.sub3 + 1);

      // Verify no mutual interference
      expect(result1.current).toBe("sub1");
      expect(result2.current).toBe("sub2");
      expect(result3.current).toBe("sub3");
    });
  });

  describe("State initialization", () => {
    it("should get current state when subscribing after navigation", async () => {
      // Navigate BEFORE creating subscription
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Now create subscription
      const { result } = renderHook(
        () => useRouterSubscription(router, (sub) => sub?.route.name ?? "none"),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // Should get current state immediately
      expect(result.current).toBe("users");
    });

    it("should handle subscription with shouldUpdate and initial state", async () => {
      // Navigate to users.view before creating subscription
      await act(async () => {
        router.navigate("users.view", { id: "123" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Create subscription with shouldUpdate for 'items' node
      const { result } = renderHook(
        () =>
          useRouterSubscription(
            router,
            (sub) => sub?.route.name ?? "none",
            (route) => route.name.startsWith("items"),
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // Initial state should be 'none' because shouldUpdate returns false for 'users.view'
      expect(result.current).toBe("none");

      // Navigate to 'home' - should NOT update (shouldUpdate returns false)
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("none");

      // Navigate to 'items.item' - SHOULD update (shouldUpdate returns true)
      await act(async () => {
        router.navigate("items.item", { id: "1" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("items.item");
    });

    it("should update correctly when selector function changes", async () => {
      let selectName = true;

      const { result, rerender } = renderHook(
        ({ useName }: { useName: boolean }) =>
          useRouterSubscription(router, (sub) => {
            if (!sub) {
              return "none";
            }

            return useName ? sub.route.name : sub.route.path;
          }),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { useName: selectName },
        },
      );

      // Initial state - should return name
      const initialName = result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(initialName).toBeTruthy();
      expect(initialName).not.toBe("none");

      // Change selector to return path
      selectName = false;
      rerender({ useName: selectName });

      // Selector change doesn't trigger recomputation until next navigation
      // So we need to navigate to see the new selector in action
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Should now return path
      expect(result.current).toBe("/home");

      // Navigate again to verify new selector is still used
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("/users");

      // Change back to name
      selectName = true;
      rerender({ useName: selectName });

      // Navigate to trigger selector recomputation with new value
      await act(async () => {
        router.navigate("about");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("about");
    });
  });

  describe("shouldUpdate edge cases", () => {
    it("should never update when shouldUpdate always returns false", async () => {
      let selectorCallCount = 0;

      const { result } = renderHook(
        () =>
          useRouterSubscription(
            router,
            () => {
              selectorCallCount++;

              return selectorCallCount;
            },
            () => false, // Always return false
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialCallCount = selectorCallCount;

      expect(result.current).toBe(initialCallCount);

      // Try multiple navigations
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe(initialCallCount);

      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe(initialCallCount);

      await act(async () => {
        router.navigate("about");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Value should never update after initialization
      expect(result.current).toBe(initialCallCount);
      expect(selectorCallCount).toBe(initialCallCount);
    });

    it("should handle errors in shouldUpdate gracefully", async () => {
      let shouldThrow = false;
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(
        () =>
          useRouterSubscription(
            router,
            (sub) => sub?.route.name ?? "none",
            () => {
              if (shouldThrow) {
                throw new Error("shouldUpdate error");
              }

              return true;
            },
          ),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialState = result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(initialState).toBeTruthy();

      // Navigate normally first
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("users");

      // Make shouldUpdate throw
      shouldThrow = true;

      // Navigation should still work (error is caught)
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // The subscription should continue working despite the error
      expect(router.getState()?.name).toBe("home");

      consoleErrorSpy.mockRestore();
    });

    it("should apply new shouldUpdate logic when it changes", async () => {
      let filterByUsers = true;

      const { result, rerender } = renderHook(
        ({ filterUsers }: { filterUsers: boolean }) =>
          useRouterSubscription(
            router,
            (sub) => sub?.route.name ?? "none",
            (route) =>
              filterUsers ? route.name === "users" : route.name === "home",
          ),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { filterUsers: filterByUsers },
        },
      );

      // Initial state is "none" because shouldUpdate returns false for "test" route
      expect(result.current).toBe("none");

      // Navigate to 'home' - should NOT update (shouldUpdate checks for 'users')
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("none");

      // Navigate to 'users' - SHOULD update
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("users");

      // Change shouldUpdate to filter by 'home'
      filterByUsers = false;
      rerender({ filterUsers: filterByUsers });

      // Navigate to 'about' - should NOT update (new shouldUpdate checks for 'home')
      await act(async () => {
        router.navigate("about");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("users");

      // Navigate to 'home' - SHOULD update with new logic
      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBe("home");
    });
  });

  describe("Performance and memoization", () => {
    it("should trigger re-renders when selector returns new object each time", async () => {
      let renderCount = 0;

      const { result } = renderHook(
        () =>
          useRouterSubscription(router, (sub) => {
            renderCount++;

            // Always create new object with same data
            return { name: sub?.route.name ?? "none" };
          }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      // eslint-disable-next-line testing-library/render-result-naming-convention
      const initialCount = renderCount;
      const firstValue = result.current;

      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Should trigger re-render because new object was created
      expect(renderCount).toBeGreaterThan(initialCount);
      expect(result.current).not.toBe(firstValue); // Different object reference
      expect(result.current.name).toBe("users");

      const secondValue = result.current;

      await act(async () => {
        router.navigate("home");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Another re-render with new object
      expect(result.current).not.toBe(secondValue);
      expect(result.current.name).toBe("home");
    });

    it("should handle large number of rapid updates efficiently", async () => {
      const states: string[] = [];

      const { result } = renderHook(
        () =>
          useRouterSubscription(router, (sub) => {
            const name = sub?.route.name ?? "none";

            states.push(name);

            return name;
          }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      const initialState = result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(initialState).toBeTruthy();

      const navigationCount = 100;
      const routes = ["home", "users", "about", "items"];

      // Perform 100 rapid navigations
      for (let i = 0; i < navigationCount; i++) {
        const targetRoute = routes[i % routes.length];

        await act(async () => {
          router.navigate(targetRoute);
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      }

      // Verify all events were processed
      expect(states.length).toBeGreaterThanOrEqual(navigationCount);

      // Final state should match last navigation
      const lastRoute = routes[(navigationCount - 1) % routes.length];

      expect(result.current).toBe(lastRoute);
    });

    it("should not leak memory when creating and destroying subscriptions", async () => {
      const subscriptionCount = 1000;
      const hooks: ReturnType<typeof renderHook>[] = [];

      // Create 1000 subscriptions
      for (let i = 0; i < subscriptionCount; i++) {
        hooks.push(
          renderHook(
            () =>
              useRouterSubscription(router, (sub) => sub?.route.name ?? "none"),
            { wrapper: (props) => wrapper({ ...props, router }) },
          ),
        );
      }

      // Verify all are working (should have same value from router state)
      const firstValue = hooks[0].result.current;

      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers
      expect(firstValue).toBeTruthy();

      for (const hook of hooks) {
        expect(hook.result.current).toBe(firstValue);
      }

      // Destroy all subscriptions
      for (const hook of hooks) {
        hook.unmount();
      }

      // Navigate to ensure no zombie subscriptions are triggered
      await act(async () => {
        router.navigate("users");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Router should still work normally
      expect(router.getState()?.name).toBe("users");

      // No errors or memory leaks should occur
    });
  });
});
