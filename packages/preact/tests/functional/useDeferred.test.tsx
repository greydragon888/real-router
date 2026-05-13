import { renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/preact";
import { useDeferred } from "@real-router/preact/ssr";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ComponentChildren }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useDeferred", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the promise registered under state.context.ssrDataDeferred[key]", () => {
    const promise = Promise.resolve(["r1", "r2"]);
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: { ...state.context, ssrDataDeferred: { reviews: promise } },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    const { result } = renderHook(() => useDeferred<string[]>("reviews"), {
      wrapper: wrapper(router),
    });

    expect(result.current).toBe(promise);
  });

  it("returns a forever-pending promise when the key is missing", async () => {
    const { result } = renderHook(() => useDeferred<string[]>("missing"), {
      wrapper: wrapper(router),
    });

    let settled = false;

    void result.current.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
  });

  it("returns a forever-pending promise when ssrDataDeferred is undefined", async () => {
    const { result } = renderHook(() => useDeferred("reviews"), {
      wrapper: wrapper(router),
    });

    let settled = false;

    void result.current.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
  });

  it("returns a stable Promise reference across renders within one navigation", () => {
    const promise = Promise.resolve(42);
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: { ...state.context, ssrDataDeferred: { x: promise } },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    const { result, rerender } = renderHook(() => useDeferred("x"), {
      wrapper: wrapper(router),
    });

    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
