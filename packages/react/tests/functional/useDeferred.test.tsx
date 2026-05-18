import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider } from "@real-router/react";
import { useDeferred } from "@real-router/react/ssr";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

const wrapper =
  (router: Router) =>
  ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

describe("useDeferred", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("returns the promise registered under state.context.ssrDataDeferred[key]", () => {
    const promise = Promise.resolve(["r1", "r2"]);

    // Manually inject a deferred map into the active state's context to
    // emulate what `defer()` + ssr-data-plugin would have done.
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

    expect(result.current).toBeInstanceOf(Promise);

    // Race against a microtask — the never-promise must lose.
    const winner = await Promise.race([
      result.current.then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
  });

  it("returns a forever-pending promise when ssrDataDeferred is undefined", async () => {
    const state = router.getState()!;

    expect(
      (state.context as { ssrDataDeferred?: unknown }).ssrDataDeferred,
    ).toBeUndefined();

    const { result } = renderHook(() => useDeferred("reviews"), {
      wrapper: wrapper(router),
    });

    const winner = await Promise.race([
      result.current.then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
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
    const second = result.current;

    expect(first).toBe(second);
  });

  it("isolates different keys", () => {
    const reviewsP = Promise.resolve(["r"]);
    const relatedP = Promise.resolve(["k"]);
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: {
        ...state.context,
        ssrDataDeferred: { reviews: reviewsP, related: relatedP },
      },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    const reviews = renderHook(() => useDeferred("reviews"), {
      wrapper: wrapper(router),
    }).result.current;
    const related = renderHook(() => useDeferred("related"), {
      wrapper: wrapper(router),
    }).result.current;

    expect(reviews).toBe(reviewsP);
    expect(related).toBe(relatedP);
    expect(reviews).not.toBe(related);
  });
});
