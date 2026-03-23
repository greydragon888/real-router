import { renderHook } from "@solidjs/testing-library";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
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

  it("should return current route via accessor", () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    const state = result();

    expect(state.route?.name).toStrictEqual("test");
  });

  it("should update when route changes", async () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    expect(result().route?.name).toStrictEqual("test");

    await router.navigate("items");

    expect(result().route?.name).toStrictEqual("items");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrow();
  });
});
