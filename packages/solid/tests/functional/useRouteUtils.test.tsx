import { RouteUtils } from "@real-router/route-utils";
import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteUtils } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
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

    expect(result).toBeInstanceOf(RouteUtils);
  });

  it("should have working getChain method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const chain = result.getChain("users.list");

    expect(chain).toStrictEqual(["users", "users.list"]);
  });

  it("should have working getSiblings method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const siblings = result.getSiblings("users.list");

    expect(siblings).toContain("users.view");
    expect(siblings).toContain("users.edit");
    expect(siblings).not.toContain("users.list");
  });

  it("should have working isDescendantOf method", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    expect(result.isDescendantOf("users.list", "users")).toBe(true);
    expect(result.isDescendantOf("users", "items")).toBe(false);
  });

  it("should return undefined for unknown routes", () => {
    const { result } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    expect(result.getChain("nonexistent")).toBeUndefined();
    expect(result.getSiblings("nonexistent")).toBeUndefined();
  });

  it("should return different RouteUtils instances for different routers", async () => {
    const router2 = createTestRouterWithADefaultRouter();

    await router2.start();

    const { result: result1 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router),
    });

    const { result: result2 } = renderHook(() => useRouteUtils(), {
      wrapper: wrapper(router2),
    });

    expect(result1).toBeInstanceOf(RouteUtils);
    expect(result2).toBeInstanceOf(RouteUtils);
    expect(result1).not.toBe(result2);

    router2.stop();
  });

  it("should throw error if used outside RouterProvider", () => {
    expect(() => renderHook(() => useRouteUtils())).toThrow(
      "useRouter must be used within a RouterProvider",
    );
  });
});
