import { act, renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Params, Router } from "@real-router/core";
import type { ReactNode } from "react";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useRoute hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    const keys = Object.keys(result.current.navigator).toSorted((a, b) =>
      a.localeCompare(b),
    );

    expect(keys).toStrictEqual(
      expect.arrayContaining([
        "navigate",
        "getState",
        "isActiveRoute",
        "subscribe",
      ]),
    );
    expect(result.current.navigator.navigate).toBe(router.navigate);
    expect(result.current.navigator.getState).toBe(router.getState);
    expect(result.current.navigator.isActiveRoute).toBe(router.isActiveRoute);
    expect(result.current.navigator.subscribe).toBe(router.subscribe);
  });

  it("should return current route", async () => {
    const subscribeSpy = vi.spyOn(router, "subscribe");

    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(subscribeSpy).toHaveBeenCalled();
    expect(result.current.route.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("items");
    });

    expect(result.current.route.name).toStrictEqual("items");
  });

  it("should return previousRoute after navigation", async () => {
    // Ensure we start on a known route
    await router.navigate("test");

    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.route.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("home");
    });

    expect(result.current.route.name).toStrictEqual("home");
    expect(result.current.previousRoute?.name).toStrictEqual("test");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrow(
      "useRoute must be used within a RouterProvider",
    );
  });

  it("should throw a clear error if router has not started yet", () => {
    const unstartedRouter = createTestRouterWithADefaultRouter();

    expect(() =>
      renderHook(() => useRoute(), { wrapper: wrapper(unstartedRouter) }),
    ).toThrow(
      /useRoute called with no active route\. Did you forget to await router\.start\(\) before rendering, or is the router stopped\/disposed\?/,
    );
  });

  it("should propagate generic params type without runtime change", async () => {
    type TypedParams = { id: string; tab: string } & Params;

    await router.navigate("test");

    const { result } = renderHook(() => useRoute<TypedParams>(), {
      wrapper: wrapper(router),
    });

    const params: TypedParams = result.current.route.params;

    expect(result.current.route.name).toStrictEqual("test");
    expect(params).toStrictEqual({});
  });
});
