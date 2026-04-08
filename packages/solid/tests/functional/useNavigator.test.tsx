import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { RouterProvider, useNavigator } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
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

    expect(result).toBeTypeOf("object");
    expect(result.navigate).toBeTypeOf("function");
    expect(result.getState).toBeTypeOf("function");
    expect(result.isActiveRoute).toBeTypeOf("function");
    expect(result.subscribe).toBeTypeOf("function");
  });

  it("should have working navigate method", async () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });

    const state = await result.navigate("items");

    expect(state).toStrictEqual(expect.objectContaining({ name: "items" }));
  });

  it("should have working getState method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.getState();

    expect(state).not.toBeNull();
    expect(state!.name).toBeTypeOf("string");
  });

  it("should have working isActiveRoute method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.getState();

    expect(state).not.toBeNull();
    expect(result.isActiveRoute(state!.name)).toBe(true);
  });

  it("should have working subscribe method", async () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    await result.navigate("about");

    expect(callback).toHaveBeenCalled();

    const callCount = callback.mock.calls.length;

    unsubscribe();

    await result.navigate("home");

    expect(callback).toHaveBeenCalledTimes(callCount);
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useNavigator())).toThrow(
      "useNavigator must be used within a RouterProvider",
    );
  });
});
