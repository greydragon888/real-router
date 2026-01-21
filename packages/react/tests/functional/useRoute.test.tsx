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

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return router", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.router).toStrictEqual(router);
  });

  it("should return current route", () => {
    vi.spyOn(router, "subscribe");

    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result.current.route?.name).toStrictEqual("test");

    act(() => {
      router.navigate("items");
    });

    expect(result.current.route?.name).toStrictEqual("items");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrowError();
  });
});
