import { act, renderHook } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Params, Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ComponentChildren }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useRoute hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.navigator).toStrictEqual(
      expect.objectContaining({
        navigate: expect.any(Function),
        getState: expect.any(Function),
        isActiveRoute: expect.any(Function),
        subscribe: expect.any(Function),
      }),
    );
  });

  it("should return current route", async () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.route.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("items");
    });

    expect(result.current.route.name).toStrictEqual("items");
  });

  it("should return previousRoute after navigation", async () => {
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

    const { result } = renderHook(() => useRoute<TypedParams>(), {
      wrapper: wrapper(router),
    });

    const params: TypedParams = result.current.route.params;

    expect(result.current.route.name).toStrictEqual("test");
    expect(params).toStrictEqual({});
  });
});
