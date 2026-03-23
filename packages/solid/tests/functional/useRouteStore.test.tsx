import { renderHook } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouterProvider, useRouteStore } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRouteStore hook", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return current route state as store object", () => {
    const { result } = renderHook(() => useRouteStore(), {
      wrapper: wrapper(router),
    });

    expect(result.route?.name).toStrictEqual("test");
    expect(result.previousRoute).toBeUndefined();
  });

  it("should update when route changes", async () => {
    const { result } = renderHook(() => useRouteStore(), {
      wrapper: wrapper(router),
    });

    expect(result.route?.name).toStrictEqual("test");

    await router.navigate("items").catch(() => {});

    expect(result.route?.name).toStrictEqual("items");
  });

  it("should throw error if router instance was not passed to provider", () => {
    expect(() => renderHook(() => useRouteStore())).toThrow();
  });

  it("should have deep granular reactivity on params", async () => {
    let effectRunCount = 0;

    renderHook(
      () => {
        const state = useRouteStore();

        createEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          state.route?.params.id;
          effectRunCount++;
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(effectRunCount).toBe(1);

    await router.navigate("items.item", { id: "123" }).catch(() => {});

    expect(effectRunCount).toBe(2);

    await router.navigate("items.item", { id: "456" }).catch(() => {});

    expect(effectRunCount).toBe(3);
  });

  it("should have deep granular reactivity on route name", async () => {
    let effectRunCount = 0;

    renderHook(
      () => {
        const state = useRouteStore();

        createEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          state.route?.name;
          effectRunCount++;
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(effectRunCount).toBe(1);

    await router.navigate("items").catch(() => {});

    expect(effectRunCount).toBe(2);

    await router.navigate("items.item", { id: "123" }).catch(() => {});

    expect(effectRunCount).toBe(3);

    await router.navigate("items.item", { id: "456" }).catch(() => {});

    expect(effectRunCount).toBe(3);
  });

  it("should access nested properties without function calls", async () => {
    const { result } = renderHook(() => useRouteStore(), {
      wrapper: wrapper(router),
    });

    await router.navigate("items.item", { id: "789" }).catch(() => {});

    expect(result.route?.name).toBe("items.item");
    expect(result.route?.params.id).toBe("789");
  });
});
