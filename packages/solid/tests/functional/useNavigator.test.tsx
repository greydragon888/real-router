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
    // Explicit "/" — JSDOM shares window.location across tests, so an
    // unprefixed router.start() can pick up a path left by a previous test.
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should expose all documented methods with proper behavior", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });

    // Each method is verified by actual behavior, not typeof.
    expect(result.getState()?.name).toBe("test");
    expect(result.isActiveRoute("test")).toBe(true);
    expect(result.isLeaveApproved()).toBe(false);

    const unsubscribe = result.subscribe(() => {});

    expect(unsubscribe).toBeTypeOf("function");

    unsubscribe();

    const unsubscribeLeave = result.subscribeLeave(() => {});

    expect(unsubscribeLeave).toBeTypeOf("function");

    unsubscribeLeave();
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

    expect(state?.name).toBe("test");
  });

  it("should have working isActiveRoute method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });

    expect(result.isActiveRoute("test")).toBe(true);
    expect(result.isActiveRoute("about")).toBe(false);
  });

  it("should have working subscribe method", async () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    await result.navigate("about");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({ name: "about" }),
      }),
    );

    unsubscribe();

    await result.navigate("home");

    // After unsubscribe callback count stays frozen at 1.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useNavigator())).toThrow(
      "useNavigator must be used within a RouterProvider",
    );
  });
});
