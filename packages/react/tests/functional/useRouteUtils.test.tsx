import { RouteUtils } from "@real-router/route-utils";
import { renderHook } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteUtils } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useRouteUtils hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return a RouteUtils instance", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    expect(result.current).toBeInstanceOf(RouteUtils);
  });

  it("should return same instance on re-render (WeakMap cache)", () => {
    const { result, rerender } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const first = result.current;

    rerender();
    const second = result.current;

    expect(first).toBe(second);
  });

  it("should have working getChain method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const chain = result.current.getChain("users.list");

    expect(chain).toStrictEqual(["users", "users.list"]);
  });

  it("should have working getSiblings method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const siblings = result.current.getSiblings("users.list");

    expect(siblings).toContain("users.view");
    expect(siblings).toContain("users.edit");
    expect(siblings).not.toContain("users.list");
  });

  it("should have working isDescendantOf method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    expect(result.current.isDescendantOf("users.list", "users")).toBe(true);
    expect(result.current.isDescendantOf("users", "items")).toBe(false);
  });

  it("should return undefined for unknown routes", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    expect(result.current.getChain("nonexistent")).toBeUndefined();
    expect(result.current.getSiblings("nonexistent")).toBeUndefined();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useRouteUtils())).toThrow(
      "useRouter must be used within a RouterProvider",
    );
  });
});
