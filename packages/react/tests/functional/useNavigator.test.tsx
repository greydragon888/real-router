// packages/react/tests/functional/useNavigator.test.tsx
import { renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider, useNavigator } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useNavigator hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return navigator with 4 methods", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });

    expect(result.current).toBeTypeOf("object");
    expect(result.current.navigate).toBeTypeOf("function");
    expect(result.current.getState).toBeTypeOf("function");
    expect(result.current.isActiveRoute).toBeTypeOf("function");
    expect(result.current.subscribe).toBeTypeOf("function");
  });

  it("should have working navigate method", async () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });

    const state = await result.current.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.current.getState();

    expect(state).not.toBeNull();
    expect(state!.name).toBeTypeOf("string");
  });

  it("should have working isActiveRoute method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.current.getState();

    expect(state).not.toBeNull();
    expect(result.current.isActiveRoute(state!.name)).toBe(true);
  });

  it("should have working subscribe method", async () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const callback = vi.fn();
    const unsubscribe = result.current.subscribe(callback);

    await result.current.navigate("about");

    expect(callback).toHaveBeenCalled();

    const callCount = callback.mock.calls.length;

    unsubscribe();

    await result.current.navigate("home");

    expect(callback).toHaveBeenCalledTimes(callCount);
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useNavigator())).toThrow(
      "useNavigator must be used within a RouterProvider",
    );
  });
});
