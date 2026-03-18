import { renderHook } from "@solidjs/testing-library";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
  expectTypeOf,
} from "vitest";

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

    expect(result).toBeDefined();
    expect(result.navigate).toBeDefined();
    expect(result.getState).toBeDefined();
    expect(result.isActiveRoute).toBeDefined();
    expect(result.subscribe).toBeDefined();
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

    expect(state).toBeDefined();
    expect(state?.name).toBeDefined();
  });

  it("should have working isActiveRoute method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.getState();

    expect(result.isActiveRoute(state?.name ?? "")).toBe(true);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should have working subscribe method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const callback = vi.fn();
    const unsubscribe = result.subscribe(callback);

    expectTypeOf(unsubscribe).toBeFunction();

    unsubscribe();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useNavigator())).toThrow(
      "useNavigator must be used within a RouterProvider",
    );
  });
});
