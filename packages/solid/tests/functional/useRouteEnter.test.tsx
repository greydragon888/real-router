// Solid useRouteEnter tests
//
// Test scope vs React reference (`packages/react/tests/functional/useRouteEnter.test.tsx`):
//
//   - **Excluded**: "uses the latest handler reference without resubscribing".
//     Solid components run **once** at mount; the handler is captured in
//     closure at the call site and there is no re-render-driven swap.
//     Reactivity in Solid happens through signals consumed inside the
//     handler body — not by replacing the handler reference.
//   - StrictMode test is React-only — Solid has no equivalent.
//
// All other tests mirror the React suite 1:1.

import { renderHook } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider, useRouteEnter } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { UseRouteEnterOptions } from "@real-router/solid";
import type { JSX } from "solid-js";

const wrapper = (router: Router) => (props: { children: JSX.Element }) => (
  <RouterProvider router={router}>{props.children}</RouterProvider>
);

describe("useRouteEnter", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("does not fire on initial mount when there is no previousRoute", () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteEnter(handler);
      },
      { wrapper: wrapper(router) },
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires once after a navigation when component is already mounted", async () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteEnter(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("about");

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("about");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("fires again on each subsequent navigation", async () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteEnter(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("about");
    await router.navigate("home");
    await router.navigate("users.list");

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].route.name).toBe("about");
    expect(handler.mock.calls[1][0].route.name).toBe("home");
    expect(handler.mock.calls[2][0].route.name).toBe("users.list");
  });

  it("provides previousRoute and route at mount time", async () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteEnter(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("users.view", { id: "42" });

    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = handler.mock.calls[0][0];

    expect(ctx.route.name).toBe("users.view");
    expect(ctx.route.params.id).toBe("42");
    expect(ctx.previousRoute.name).toBe("test");
  });

  it("skips the handler on same-route navigation by default", async () => {
    const handler = vi.fn();

    renderHook(
      () => {
        useRouteEnter(handler);
      },
      { wrapper: wrapper(router) },
    );

    await router.navigate("users.view", { id: "1" });

    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler on same-route navigation when skipSameRoute=false", async () => {
    const handler = vi.fn();
    const options: UseRouteEnterOptions = { skipSameRoute: false };

    renderHook(
      () => {
        useRouteEnter(handler, options);
      },
      {
        wrapper: wrapper(router),
      },
    );

    await router.navigate("users.view", { id: "1" });
    handler.mockClear();

    await router.navigate("users.view", { id: "1", q: "x" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire on unmount", async () => {
    const handler = vi.fn();

    const { cleanup } = renderHook(
      () => {
        useRouteEnter(handler);
      },
      {
        wrapper: wrapper(router),
      },
    );

    cleanup();

    await router.navigate("about");

    expect(handler).not.toHaveBeenCalled();
  });
});
