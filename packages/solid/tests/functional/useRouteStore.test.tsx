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

    // Explicit "/" — JSDOM shares window.location across tests.
    await router.start("/");
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
    expect(() => renderHook(() => useRouteStore())).toThrow(
      "useRouter must be used within a RouterProvider",
    );
  });

  it("should have deep granular reactivity on params", async () => {
    const observedIds: (string | number | undefined)[] = [];

    renderHook(
      () => {
        const state = useRouteStore();

        createEffect(() => {
          observedIds.push(state.route?.params.id as string | undefined);
        });
      },
      { wrapper: wrapper(router) },
    );

    // Initial run: no id (router started on "test").
    expect(observedIds).toStrictEqual([undefined]);

    await router.navigate("items.item", { id: "123" }).catch(() => {});

    expect(observedIds).toStrictEqual([undefined, "123"]);

    await router.navigate("items.item", { id: "456" }).catch(() => {});

    expect(observedIds).toStrictEqual([undefined, "123", "456"]);
  });

  it("should have deep granular reactivity on route name", async () => {
    const observedNames: (string | undefined)[] = [];

    renderHook(
      () => {
        const state = useRouteStore();

        createEffect(() => {
          observedNames.push(state.route?.name);
        });
      },
      { wrapper: wrapper(router) },
    );

    expect(observedNames).toStrictEqual(["test"]);

    await router.navigate("items").catch(() => {});

    expect(observedNames).toStrictEqual(["test", "items"]);

    await router.navigate("items.item", { id: "123" }).catch(() => {});

    expect(observedNames).toStrictEqual(["test", "items", "items.item"]);

    // Only params change — effect reads state.route?.name, so it must NOT run.
    await router.navigate("items.item", { id: "456" }).catch(() => {});

    expect(observedNames).toStrictEqual(["test", "items", "items.item"]);
  });

  it("should access nested properties without function calls", async () => {
    const { result } = renderHook(() => useRouteStore(), {
      wrapper: wrapper(router),
    });

    await router.navigate("items.item", { id: "789" }).catch(() => {});

    expect(result.route?.name).toBe("items.item");
    expect(result.route?.params.id).toBe("789");
  });

  it("should have reactive previousRoute after navigation", async () => {
    let effectRunCount = 0;

    // Ensure known starting route
    await router.navigate("test").catch(() => {});

    renderHook(
      () => {
        const state = useRouteStore();

        createEffect(() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          state.previousRoute?.name;
          effectRunCount++;
        });
      },
      { wrapper: wrapper(router) },
    );

    const { result } = renderHook(() => useRouteStore(), {
      wrapper: wrapper(router),
    });

    expect(effectRunCount).toBe(1);

    await router.navigate("home").catch(() => {});

    expect(result.route?.name).toBe("home");
    expect(result.previousRoute?.name).toBe("test");
    expect(effectRunCount).toBe(2);

    await router.navigate("about").catch(() => {});

    expect(result.previousRoute?.name).toBe("home");
    expect(effectRunCount).toBe(3);
  });
});
