import { act, renderHook } from "@testing-library/preact";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/preact";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
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

    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.navigator).toBeTypeOf("object");
    expect(result.current.navigator.navigate).toBeTypeOf("function");
    expect(result.current.navigator.getState).toBeTypeOf("function");
    expect(result.current.navigator.isActiveRoute).toBeTypeOf("function");
    expect(result.current.navigator.subscribe).toBeTypeOf("function");
  });

  it("should return current route", async () => {
    vi.spyOn(router, "subscribe");

    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.route?.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");
  });

  it("should return previousRoute after navigation", async () => {
    // Ensure we start on a known route
    await router.navigate("test");

    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.route?.name).toStrictEqual("test");

    await act(async () => {
      await router.navigate("home");
    });

    expect(result.current.route?.name).toStrictEqual("home");
    expect(result.current.previousRoute?.name).toStrictEqual("test");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrow();
  });
});
