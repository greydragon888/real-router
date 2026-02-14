// packages/react/tests/functional/useNavigator.test.tsx
import { renderHook } from "@testing-library/react";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
  expectTypeOf,
} from "vitest";

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

    expect(result.current).toBeDefined();
    expect(result.current.navigate).toBeDefined();
    expect(result.current.getState).toBeDefined();
    expect(result.current.isActiveRoute).toBeDefined();
    expect(result.current.subscribe).toBeDefined();
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

    expect(state).toBeDefined();
    expect(state?.name).toBeDefined();
  });

  it("should have working isActiveRoute method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const state = result.current.getState();

    expect(result.current.isActiveRoute(state?.name ?? "")).toBe(true);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should have working subscribe method", () => {
    const { result } = renderHook(() => useNavigator(), {
      wrapper: wrapper(router),
    });
    const callback = vi.fn();
    const unsubscribe = result.current.subscribe(callback);

    expectTypeOf(unsubscribe).toBeFunction();

    unsubscribe();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useNavigator())).toThrowError(
      "useNavigator must be used within a RouterProvider",
    );
  });
});
