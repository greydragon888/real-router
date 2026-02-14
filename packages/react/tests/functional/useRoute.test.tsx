import { act, renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
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

    expect(result.current.navigator).toBeDefined();
    expect(result.current.navigator.navigate).toBeDefined();
    expect(result.current.navigator.getState).toBeDefined();
    expect(result.current.navigator.isActiveRoute).toBeDefined();
    expect(result.current.navigator.subscribe).toBeDefined();
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

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrowError();
  });
});
