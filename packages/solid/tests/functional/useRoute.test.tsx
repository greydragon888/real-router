import { renderHook } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRoute } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Params, Router } from "@real-router/core";
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

  it("should update previousRoute after navigation", async () => {
    const { result } = renderHook(() => useRoute(), {
      wrapper: wrapper(router),
    });

    // Navigate to a known route first
    await router.navigate("home");

    expect(result().route?.name).toStrictEqual("home");

    await router.navigate("items");

    expect(result().route?.name).toStrictEqual("items");
    expect(result().previousRoute?.name).toStrictEqual("home");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRoute())).toThrow(
      "useRoute must be used within a RouterProvider",
    );
  });

  it("should fire effects the correct number of times on navigations", async () => {
    let effectRunCount = 0;

    // Ensure known starting route
    await router.navigate("test").catch(() => {});

    renderHook(
      () => {
        const routeState = useRoute();

        createEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          routeState().route?.name;
          effectRunCount++;
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(effectRunCount).toBe(1);

    await router.navigate("home");

    expect(effectRunCount).toBe(2);

    await router.navigate("about");

    expect(effectRunCount).toBe(3);
  });

  it("should propagate generic params type without runtime change", async () => {
    type TypedParams = { id: string; tab: string } & Params;

    await router.navigate("test").catch(() => {});

    const { result } = renderHook(() => useRoute<TypedParams>(), {
      wrapper: wrapper(router),
    });

    const params: TypedParams | undefined = result().route?.params;

    expect(result().route?.name).toStrictEqual("test");
    expect(params).toBeDefined();
  });
});
