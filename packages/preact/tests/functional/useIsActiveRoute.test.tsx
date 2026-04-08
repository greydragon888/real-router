import { getRoutesApi } from "@real-router/core/api";
import { act, renderHook } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider } from "@real-router/preact";

import { useIsActiveRoute } from "../../src/hooks/useIsActiveRoute";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

const wrapper: FunctionComponent<{ router: Router }> = ({
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

  it("should handle non-strict mode", () => {
    const { result } = renderHook(() => useIsActiveRoute("users", {}, false), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current).toBe(true);
  });

  it("should handle strict mode", () => {
    const { result } = renderHook(() => useIsActiveRoute("users", {}, true), {
      wrapper: (props) => wrapper({ ...props, router }),
    });

    expect(result.current).toBe(false);
  });

  it("should skip unrelated route updates", async () => {
    let checkCount = 0;
    const originalIsActive = router.isActiveRoute.bind(router);

    vi.spyOn(router, "isActiveRoute").mockImplementation((...args) => {
      checkCount++;

      return originalIsActive(...args);
    });

    const { result } = renderHook(
      () => useIsActiveRoute("users.view", { id: "123" }),
      { wrapper: (props) => wrapper({ ...props, router }) },
    );

    const initialCheckCount = checkCount;

    await act(async () => {
      await router.navigate("home");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(checkCount).toBe(initialCheckCount);
    expect(result.current).toBe(false);
  });

  describe("Optimization and parameters", () => {
    it("should update when activeStrict changes and router navigates", async () => {
      const { result, rerender } = renderHook(
        ({ strict }: { strict: boolean }) =>
          useIsActiveRoute("users", {}, strict),
        {
          wrapper: (props) => wrapper({ ...props, router }),
          initialProps: { strict: false },
        },
      );

      expect(result.current).toBe(true);

      rerender({ strict: true });

      await act(async () => {
        await router.navigate("home");
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current).toBe(false);

      rerender({ strict: false });
      await act(async () => {
        await router.navigate("home");
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current).toBe(true);
    });

    it("should handle complex route parameters correctly", async () => {
      getRoutesApi(router).add([{ name: "complex", path: "/complex" }]);

      const complexParams = {
        filter: "active",
        sort: "date",
        page: 1,
        nested: { a: 1, b: 2 },
      };

      await act(async () => {
        await router.navigate("complex", complexParams);
      });

      const { result } = renderHook(
        () => useIsActiveRoute("complex", complexParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(true);

      await act(async () => {
        await router.navigate("complex", { ...complexParams, page: 2 });
      });

      const { result: result2 } = renderHook(
        () => useIsActiveRoute("complex", { ...complexParams, page: 2 }),
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

      rerender({ params: { id: "456" } });

      await act(async () => {
        await router.navigate("home");
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current).toBe(false);

      rerender({ params: { id: "123" } });
      await act(async () => {
        await router.navigate("home");
      });
      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

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

      await act(async () => {
        await router.navigate("search", specialParams);
      });

      const { result } = renderHook(
        () => useIsActiveRoute("search", specialParams),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(true);
    });

    it("should handle numeric vs string parameters consistently", async () => {
      const { result: stringParam } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(stringParam.current).toBe(true);

      await act(async () => {
        await router.navigate("users.view", { id: "123" }).catch(() => {});
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

      for (let i = 0; i < 1000; i++) {
        await act(async () => {
          await router.navigate(i % 2 === 0 ? "home" : "users.view", {
            id: "123",
          });
        });
      }

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

      for (const hook of hooks) {
        expect(hook.result.current).toBe(true);
      }

      await act(async () => {
        await router.navigate("home");
      });

      for (const hook of hooks) {
        expect(hook.result.current).toBe(false);
      }
    });

    it("should handle dynamic routeName changes", () => {
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

      for (let i = 0; i < 100; i++) {
        currentIndex = (currentIndex + 1) % routes.length;
        rerender({ routeName: routes[currentIndex] });
      }

      expect(result.current).toBeTypeOf("boolean");
    });
  });

  describe("Route hierarchy edge cases", () => {
    it("should correctly check parent route with nested active route", async () => {
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

      await act(async () => {
        await router.navigate("settings.profile.edit");
      });

      const { result: nonStrict } = renderHook(
        () => useIsActiveRoute("settings", {}, false),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(nonStrict.current).toBe(true);

      const { result: strict } = renderHook(
        () => useIsActiveRoute("settings", {}, true),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(strict.current).toBe(false);

      const { result: intermediate } = renderHook(
        () => useIsActiveRoute("settings.profile", {}, false),
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
        await router.navigate("users.view", { id: "123" }).catch(() => {});
      });

      const { result: userRoute } = renderHook(
        () => useIsActiveRoute("user", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(userRoute.current).toBe(false);

      await act(async () => {
        await router.navigate("user");
      });

      expect(userRoute.current).toBe(true);

      const { result: usersRoute } = renderHook(
        () => useIsActiveRoute("users", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(usersRoute.current).toBe(false);
    });

    it("should handle root-level route correctly", async () => {
      getRoutesApi(router).add([{ name: "dashboard", path: "/dashboard" }]);

      await act(async () => {
        await router.navigate("dashboard");
      });

      const { result: dashboardCheck } = renderHook(
        () => useIsActiveRoute("dashboard", {}),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(dashboardCheck.current).toBe(true);

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(dashboardCheck.current).toBe(false);
    });
  });

  describe("Router synchronization", () => {
    it("should handle check before router start", async () => {
      const newRouter = createTestRouterWithADefaultRouter();

      const { result } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        {
          wrapper: (props) => (
            <RouterProvider router={newRouter}>{props.children}</RouterProvider>
          ),
        },
      );

      expect(result.current).toBe(false);

      await act(async () => {
        await newRouter.start("/users/123");
      });

      expect(result.current).toBe(true);

      newRouter.stop();
    });

    it("should handle router stop and restart during operation", async () => {
      await act(async () => {
        router.stop();
        await router.start("/home");
      });

      const { result } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        { wrapper: (props) => wrapper({ ...props, router }) },
      );

      expect(result.current).toBe(false);

      await act(async () => {
        await router.navigate("users.view", { id: "123" });
      });

      expect(result.current).toBe(true);

      await act(async () => {
        await router.navigate("home");
      });

      expect(result.current).toBe(false);
    });

    it("should work with different router instances independently", async () => {
      const router1 = createTestRouterWithADefaultRouter();
      const router2 = createTestRouterWithADefaultRouter();

      await router1.start("/users/123");
      await router2.start("/home");

      const { result: result1 } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        {
          wrapper: ({ children }) => (
            <RouterProvider router={router1}>{children}</RouterProvider>
          ),
        },
      );

      expect(result1.current).toBe(true);

      const { result: result2 } = renderHook(
        () => useIsActiveRoute("users.view", { id: "123" }),
        {
          wrapper: ({ children }) => (
            <RouterProvider router={router2}>{children}</RouterProvider>
          ),
        },
      );

      expect(result2.current).toBe(false);

      await act(async () => {
        await router2.navigate("users.view", { id: "123" });
      });

      expect(result2.current).toBe(true);
      expect(result1.current).toBe(true);

      router1.stop();
      router2.stop();
    });
  });
});
